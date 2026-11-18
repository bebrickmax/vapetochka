import { stores, type Store } from "@/config/stores";
import { BACKUP_BUCKET, backupDay, saveDailyBackup } from "@/lib/db/backup";
import { isDbConfigured, storageDownload, storageUpload } from "@/lib/db/supabase";
import { loadSettings, markSynced, sourceOf, syncStore, type SettingsState, type StoreSource, type SyncReport } from "@/lib/db/sync";
import { fetchStoreRows, withSheetImages } from "@/lib/sheets/sources";
import { sheetsVersion, versionFromHtml } from "@/lib/sheets/version";

/*
 * Автообновление витрины (/api/revalidate) — экономное.
 *
 * Сигналы приходят часто: Apps Script из обеих таблиц (после правки и раз в 10 минут), расписание
 * Supabase (раз в 10 минут). Раньше каждый сигнал заново качал обе таблицы со всеми фото, синхронизировал
 * базу и пересобирал обе витрины — даже если ничего не менялось. На этом кончались бесплатные лимиты
 * Vercel (процессорное время) и Supabase (трафик).
 *
 * Теперь на каждый сигнал скачиваются только значения ячеек (без фото) и считается их версия:
 *  • база на паузе — версия сравнивается с версией на странице точки (<meta>, src/app/[store]/page.tsx):
 *    совпала — страница уже показывает эту таблицу, ничего не делаем;
 *  • база работает — версия сравнивается с версией последней синхронизации (файл в закрытом бакете
 *    backups): совпала — база и так как в таблице, синхронизация не нужна. Раз в FULL_SYNC_HOURS часов
 *    синхронизация всё равно проходит целиком (подхватит, например, фото, вставленное в старую строку).
 * Не совпала — как раньше: фото, синхронизация, пересборка витрины — только этой точки.
 */

/** Как часто база синхронизируется целиком, даже если значения таблицы не менялись. */
const FULL_SYNC_HOURS = 6;
const STATE_FILE = "sync-state.json";

export interface StoreRefresh {
  storeId: string;
  /** Витрину точки надо пересобрать: изменилась таблица или база после синхронизации. */
  changed: boolean;
  /** Проверка прошла — витрина и так актуальна. */
  unchanged?: boolean;
  /** Синхронизация этой точки уже идёт (другой сигнал) — повторить позже. */
  skipped?: boolean;
  error?: string;
  report?: SyncReport;
}

interface StoreState {
  /** Версия таблицы, с которой база синхронизирована. */
  version: string;
  source: StoreSource;
  /** Последняя полная синхронизация. */
  fullAt: string;
  /** Прошлая синхронизация закончила не всё (фото в очереди, отложенное удаление) — повторить. */
  retry?: boolean;
}

export interface SyncState {
  stores: Record<string, StoreState>;
  /** День последней резервной копии базы (по Минску). */
  backupDay?: string;
}

export type RefreshResult =
  | { mode: "sheets"; stores: StoreRefresh[] }
  | { mode: "db"; stores: StoreRefresh[]; state: SyncState }
  /** Старая схема базы без зеркала таблицы — обновляем всё, как раньше. */
  | { mode: "legacy"; stores: StoreRefresh[] };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ─── База на паузе: сверка со страницей точки ───────────────────────────────

/** Версия таблицы, из которой собрана страница точки, которую сейчас видят покупатели. */
async function servedVersion(origin: string, storeId: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/${storeId}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    return res.ok ? versionFromHtml(await res.text()) : null;
  } catch {
    return null;
  }
}

async function checkSheetStore(store: Store, origin: string): Promise<StoreRefresh> {
  try {
    const [rows, served] = await Promise.all([fetchStoreRows(store), servedVersion(origin, store.id)]);
    // Версию страницы узнать не удалось — пересобираем, как раньше: лучше лишний раз, чем показывать старое.
    const changed = served !== sheetsVersion(rows);
    return { storeId: store.id, changed, ...(!changed && { unchanged: true }) };
  } catch (error) {
    console.error(`[refresh] «${store.title}»: таблица не прочиталась:`, error);
    return { storeId: store.id, changed: false, error: errorText(error) };
  }
}

// ─── База работает: сверка с последней синхронизацией ───────────────────────

export async function loadSyncState(): Promise<SyncState> {
  try {
    const text = await storageDownload(BACKUP_BUCKET, STATE_FILE);
    const parsed = text ? (JSON.parse(text) as Partial<SyncState>) : null;
    if (parsed && typeof parsed === "object" && parsed.stores && typeof parsed.stores === "object") {
      return { stores: parsed.stores, ...(parsed.backupDay && { backupDay: parsed.backupDay }) };
    }
  } catch (error) {
    // Без файла просто синхронизируем целиком, как раньше.
    console.warn("[refresh] Состояние синхронизации не прочиталось:", error);
  }
  return { stores: {} };
}

export async function saveSyncState(state: SyncState): Promise<void> {
  try {
    await storageUpload(BACKUP_BUCKET, STATE_FILE, new TextEncoder().encode(JSON.stringify(state)), "application/json");
  } catch (error) {
    console.warn("[refresh] Состояние синхронизации не сохранилось:", error);
  }
}

/** Синхронизация закончила не всё — в следующий раз синхронизировать снова, даже если таблица та же. */
const needsRetry = (report: SyncReport) =>
  report.photos.pending > 0 || (report.stock.removalSkipped && report.stock.skipReason !== "mass");

async function checkDbStore(store: Store, settings: SettingsState, state: SyncState, now: number): Promise<StoreRefresh> {
  const source = sourceOf(settings, store.id);
  const prev = state.stores[store.id];
  try {
    const rows = await fetchStoreRows(store);
    const version = sheetsVersion(rows);
    const sheetChanged = !prev || prev.version !== version || prev.source !== source;
    const nowIso = new Date(now).toISOString();

    if (source === "db") {
      // Товары точки — только из базы (после правок админка сама пересобирает витрину), из таблицы — лишь ОПТ.
      if (sheetChanged) state.stores[store.id] = { version, source, fullAt: nowIso };
      return { storeId: store.id, changed: sheetChanged, ...(!sheetChanged && { unchanged: true }) };
    }

    const fullDue = !prev || !(now - Date.parse(prev.fullAt) < FULL_SYNC_HOURS * 3_600_000);
    if (!sheetChanged && !prev?.retry && !fullDue) {
      await markSynced(store.id).catch((error) => console.warn(`[refresh] «${store.title}»: время проверки не записалось:`, error));
      return { storeId: store.id, changed: false, unchanged: true };
    }

    const synced = await syncStore(store.id, { sheets: await withSheetImages(store, rows), maxPhotos: 20, photoSeconds: 20 });
    if (!synced) return { storeId: store.id, changed: false, skipped: true };
    const { report } = synced;
    state.stores[store.id] = { version, source, fullAt: nowIso, ...(needsRetry(report) && { retry: true }) };
    // ОПТ в синхронизацию не входит — изменившуюся таблицу показываем заново в любом случае.
    return { storeId: store.id, changed: report.changed || sheetChanged, report };
  } catch (error) {
    console.error(`[refresh] «${store.title}»: синхронизация не удалась:`, error);
    return { storeId: store.id, changed: false, error: errorText(error) };
  }
}

// ─── Точка входа ────────────────────────────────────────────────────────────

/**
 * Проверяет обе точки и, где таблица изменилась, синхронизирует базу. Витрины не трогает: какие
 * пересобрать, решает вызывающий по полю changed. origin — адрес сайта (для сверки со страницами).
 * Ошибка — только если не прочитались настройки точек в базе.
 */
export async function refreshCatalog(origin: string, now = Date.now()): Promise<RefreshResult> {
  if (!isDbConfigured()) {
    return { mode: "sheets", stores: await Promise.all(stores.map((store) => checkSheetStore(store, origin))) };
  }
  const settings = await loadSettings();
  if (!settings?.mirror) return { mode: "legacy", stores: stores.map((store) => ({ storeId: store.id, changed: true })) };

  const state = await loadSyncState();
  const before = JSON.stringify(state);
  const results: StoreRefresh[] = [];
  // По очереди: синхронизация тяжёлая, две сразу не нужны.
  for (const store of stores) results.push(await checkDbStore(store, settings, state, now));
  if (JSON.stringify(state) !== before) await saveSyncState(state);
  return { mode: "db", stores: results, state };
}

/** Резервная копия базы раз в сутки — без лишних запросов к хранилищу, если сегодняшняя уже есть. */
export async function backupIfDue(state: SyncState, now = new Date()): Promise<string | null> {
  const today = backupDay(now);
  if (state.backupDay === today) return null;
  const saved = await saveDailyBackup(now);
  await saveSyncState({ ...state, backupDay: today });
  return saved;
}

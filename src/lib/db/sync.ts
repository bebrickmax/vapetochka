import { getStore, storeInfos } from "@/config/stores";
import { fetchStoreSheets, type StoreSheets } from "@/lib/sheets/sources";
import { loadSnapshot } from "./catalog";
import { categoriesFromSheets } from "./import";
import { copyPhoto } from "./photos";
import { DbError, inList, insert, isDbConfigured, remove, selectAll, update } from "./supabase";
import {
  itemRef,
  planCleanup,
  planItems,
  planLines,
  planStock,
  sheetLines,
  type PhotoNeed,
  type StockWrite,
  type SyncContext,
} from "./sync-plan";
import { journal, removalDrafts } from "./trash";
import type { DbItem, DbLine, DbSnapshot, DbStock } from "./types";

/*
 * Синхронизация «Google Таблица → база» для точки в режиме «от таблицы».
 * Логика — в sync-plan.ts, здесь только чтение/запись и блокировка от двойного запуска.
 */

export type StoreSource = "sheet" | "db";

export interface StoreSettings {
  store_id: string;
  source: StoreSource;
  synced_at?: string | null;
  sync_lock?: string | null;
}

export interface SettingsState {
  rows: Map<string, StoreSettings>;
  /** В базе есть всё для зеркала таблицы (schema.sql обновлён). */
  mirror: boolean;
}

/** Настройки точек. null — таблицы настроек нет (старая схема). */
export async function loadSettings(): Promise<SettingsState | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await selectAll<StoreSettings>("store_settings", { select: "store_id,source,synced_at,sync_lock" });
    // Колонки зеркала есть и у позиций — проверяем одним дешёвым запросом.
    await selectAll("item_stock", { select: "sheet_status", limit: 1 });
    return { rows: new Map(rows.map((r) => [r.store_id, r])), mirror: true };
  } catch (error) {
    if (!(error instanceof DbError)) throw error;
    if (error.status === 404) return null;
    if (error.status !== 400) throw error;
    // Таблица настроек есть, а колонок зеркала ещё нет.
    try {
      const rows = await selectAll<StoreSettings>("store_settings", { select: "store_id,source" });
      return { rows: new Map(rows.map((r) => [r.store_id, r])), mirror: false };
    } catch (inner) {
      if (inner instanceof DbError && inner.status === 404) return null;
      throw inner;
    }
  }
}

export const sourceOf = (state: SettingsState | null, storeId: string): StoreSource =>
  state?.rows.get(storeId)?.source ?? "sheet";

export async function setStoreSource(storeId: string, source: StoreSource): Promise<void> {
  await insert("store_settings", { store_id: storeId, source }, { onConflict: "store_id" });
}

// ─── Блокировка ─────────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
/** Дольше, чем может работать функция синхронизации (maxDuration 300 с), — чтобы две не шли сразу. */
const LOCK_SECONDS = 330;

async function acquire(storeId: string, minIntervalSeconds: number): Promise<boolean> {
  await insert("store_settings", { store_id: storeId, source: "sheet" }, { onConflict: "store_id", ignoreDuplicates: true });
  const now = Date.now();
  // Значения в кавычках: двоеточия в дате — служебные символы фильтров PostgREST.
  const conditions = [`or(sync_lock.is.null,sync_lock.lt."${iso(new Date(now - LOCK_SECONDS * 1000))}")`];
  if (minIntervalSeconds > 0) conditions.push(`or(synced_at.is.null,synced_at.lt."${iso(new Date(now - minIntervalSeconds * 1000))}")`);
  const rows = await update("store_settings", { store_id: `eq.${storeId}`, and: `(${conditions.join(",")})` }, { sync_lock: iso(new Date(now)) });
  return rows.length > 0;
}

async function release(storeId: string, ok: boolean) {
  await update("store_settings", { store_id: `eq.${storeId}` }, { sync_lock: null, ...(ok && { synced_at: iso(new Date()) }) });
}

// ─── Запись ─────────────────────────────────────────────────────────────────

const BATCH = 500;
const CHUNK = 150;

async function insertBatched<T>(table: string, rows: object[], onConflict?: string): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(...(await insert<T>(table, rows.slice(i, i + BATCH), onConflict ? { onConflict } : {})));
  return out;
}

async function removeIn(table: string, column: string, ids: string[], extra: Record<string, string> = {}) {
  for (let i = 0; i < ids.length; i += CHUNK) await remove(table, { ...extra, [column]: inList(ids.slice(i, i + CHUNK)) });
}

async function selectIn<T>(table: string, ids: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) rows.push(...(await selectAll<T>(table, { id: inList(ids.slice(i, i + CHUNK)) })));
  return rows;
}

/** Поля, которые синхронизация меняет у линеек и позиций (метку «Новинка» и прочее админки не трогает). */
const LINE_FIELDS = ["name", "brand", "section", "note", "sheet_key", "sort"] as const;
const ITEM_FIELDS = ["title", "variant", "sheet_key", "sort"] as const;

/** Только изменившиеся поля next относительно base. */
function changed<T extends object>(next: T, base: T, fields: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) if ((next[f] ?? null) !== (base[f] ?? null)) out[f] = next[f];
  return out;
}

const lineRow = (l: DbLine) => ({
  id: l.id,
  category_id: l.category_id,
  name: l.name,
  brand: l.brand,
  section: l.section,
  note: l.note,
  image_url: l.image_url,
  sort: l.sort,
  sheet_key: l.sheet_key ?? null,
});
const itemRow = (i: DbItem) => ({
  id: i.id,
  line_id: i.line_id,
  title: i.title,
  variant: i.variant,
  image_url: i.image_url,
  sort: i.sort,
  sheet_key: i.sheet_key ?? null,
});

/**
 * Правки линеек / позиций поверх их текущих строк в базе. Строки перечитываются прямо перед записью:
 * пока копировались фото (до пары минут), в админке могли поставить своё фото — его не затираем
 * старой копией. Удалённое за это время не воскрешаем.
 */
async function applyPatches<T extends { id: string }>(table: string, patches: Map<string, Partial<T>>, toRow: (row: T) => object) {
  if (patches.size === 0) return;
  const fresh = await selectIn<T>(table, [...patches.keys()]);
  await insertBatched(table, fresh.map((row) => toRow({ ...row, ...patches.get(row.id) })), "id");
}

/**
 * Записи наличия пачками с одинаковым набором колонок: PostgREST при upsert обновляет только
 * переданные колонки, а в одной пачке у всех строк должны быть одни и те же.
 */
async function writeStock(rows: StockWrite[]) {
  const groups = new Map<string, StockWrite[]>();
  for (const row of rows) {
    const key = Object.keys(row).sort().join(",");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) await insertBatched("item_stock", group, "item_id,store_id");
}

interface PhotoBudget {
  left: number;
  copied: number;
  failed: number;
  pending: number;
}

/**
 * Копирует фото с лимитом на один запуск (остальные — в следующие). После deadline новые фото
 * не начинаются — чтобы синхронизация успела записать остальное, пока функцию не остановили.
 */
async function copyWithBudget(needs: PhotoNeed[], budget: PhotoBudget, deadline: number) {
  const take = needs.slice(0, Math.max(0, budget.left));
  budget.pending += needs.length - take.length;
  budget.left -= take.length;
  const result = new Map<string, string>();
  let next = 0;
  const worker = async () => {
    while (next < take.length && Date.now() < deadline) {
      const need = take[next++];
      const url = await copyPhoto(need.url);
      if (url) {
        result.set(need.ref, url);
        budget.copied++;
      } else budget.failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, take.length) }, worker));
  budget.pending += take.length - next; // не успели — в следующий раз
  return result;
}

// ─── Синхронизация ──────────────────────────────────────────────────────────

export interface SyncReport {
  storeId: string;
  lines: { created: number; updated: number; removed: number };
  items: { created: number; updated: number; removed: number };
  /** skipReason: mass — уходит слишком много, partial — список листов был запасной, journal — не сохранилась копия. */
  stock: {
    added: number;
    updated: number;
    removed: number;
    removalSkipped: boolean;
    skipReason?: "mass" | "partial" | "journal";
    /** Убранное сохранено в «Недавно удалённые». */
    journaled?: boolean;
  };
  photos: { copied: number; failed: number; pending: number };
  first: boolean;
  changed: boolean;
}

export interface SyncResult {
  report: SyncReport;
  /** Скачанная таблица — для листа «ОПТ» без повторного запроса. */
  sheets: StoreSheets;
  /** Снимок базы после синхронизации (если ничего не менялось — тот же, что до). */
  snapshot: DbSnapshot | null;
}

export interface SyncOptions {
  /** Наличие и цены точки строго как в таблице. */
  force?: boolean;
  /** Только добавить новое. */
  onlyNew?: boolean;
  /** Сколько фото скопировать за раз (остальные — в следующие запуски). */
  maxPhotos?: number;
  /** Сколько секунд от начала синхронизации можно тратить на фото (по умолчанию 120). */
  photoSeconds?: number;
  /** Не запускать, если последняя синхронизация была недавно (секунды). */
  minIntervalSeconds?: number;
}

/** null — синхронизация уже идёт или была только что. */
export async function syncStore(storeId: string, options: SyncOptions = {}): Promise<SyncResult | null> {
  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);
  if (!(await acquire(storeId, options.minIntervalSeconds ?? 0))) return null;

  let ok = false;
  try {
    const result = await runSync(storeId, options);
    ok = true;
    return result;
  } finally {
    await release(storeId, ok).catch((e) => console.error("[sync] Не удалось снять блокировку:", e));
  }
}

async function runSync(storeId: string, options: SyncOptions): Promise<SyncResult> {
  const store = getStore(storeId)!;
  return syncFromSheets(storeId, await fetchStoreSheets(store), options);
}

/** Синхронизация по уже скачанной таблице (без блокировки — её берёт syncStore). */
export async function syncFromSheets(storeId: string, sheets: StoreSheets, options: SyncOptions = {}): Promise<SyncResult> {
  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);
  const settings = await loadSettings();
  const { categories, lines } = sheetLines(categoriesFromSheets(sheets.sheets));
  const total = lines.reduce((n, l) => n + l.items.length, 0);
  if (total === 0) throw new Error(`Таблица «${store.title}» прочиталась пустой — синхронизацию пропускаю`);

  const snapshot = await loadSnapshot();
  const index = storeInfos.findIndex((s) => s.id === storeId);
  const ctx: SyncContext = {
    storeId,
    priorStores: storeInfos.slice(0, Math.max(0, index)).map((s) => s.id),
    first: !settings?.rows.get(storeId)?.synced_at,
    force: !!options.force,
    onlyNew: !!options.onlyNew,
    partial: !!sheets.partial,
  };
  const budget: PhotoBudget = { left: options.maxPhotos ?? 10, copied: 0, failed: 0, pending: 0 };
  const photoDeadline = Date.now() + (options.photoSeconds ?? 120) * 1000;
  const report: SyncReport = {
    storeId,
    lines: { created: 0, updated: 0, removed: 0 },
    items: { created: 0, updated: 0, removed: 0 },
    stock: { added: 0, updated: 0, removed: 0, removalSkipped: false },
    photos: budget,
    first: ctx.first,
    changed: false,
  };

  // 1. Категории.
  const known = new Set(snapshot.categories.map((c) => c.id));
  const newCategories = categories.filter((c) => !known.has(c.id));
  if (newCategories.length) await insert("categories", newCategories, { onConflict: "id", ignoreDuplicates: true });

  // 2. Линейки.
  const lp = planLines(lines, snapshot, ctx);
  const linePhotos = await copyWithBudget(lp.photos, budget, photoDeadline);
  const created = await insertBatched<DbLine>(
    "product_lines",
    lp.create.map((c) => ({ ...c.row, image_url: linePhotos.get(c.ref) ?? null })),
  );
  const lineIds = new Map(lp.resolved);
  const createdByKey = new Map(created.map((l) => [`${l.category_id}::${l.sheet_key}`, l.id]));
  for (const c of lp.create) {
    const id = createdByKey.get(c.ref);
    if (id) lineIds.set(c.ref, id);
  }
  const linesById = new Map(snapshot.lines.map((l) => [l.id, l]));
  const lineUpdates = new Map<string, Partial<DbLine>>();
  for (const next of lp.update) lineUpdates.set(next.id, changed(next, linesById.get(next.id) ?? next, LINE_FIELDS));
  for (const [ref, url] of linePhotos) if (linesById.has(ref)) lineUpdates.set(ref, { ...lineUpdates.get(ref), image_url: url });
  for (const [id, patch] of lineUpdates) if (Object.keys(patch).length === 0) lineUpdates.delete(id);
  await applyPatches<DbLine>("product_lines", lineUpdates, lineRow);
  report.lines.created = created.length;
  report.lines.updated = lineUpdates.size;

  // 3. Позиции.
  const ip = planItems(lines, lineIds, snapshot, ctx);
  const itemPhotos = await copyWithBudget(ip.photos, budget, photoDeadline);
  const createdItems = await insertBatched<DbItem>(
    "items",
    ip.create.map((c) => ({ ...c.row, image_url: itemPhotos.get(c.ref) ?? null })),
  );
  const itemIds = new Map(ip.resolved);
  const createdItemsByKey = new Map(createdItems.map((i) => [itemRef(i.line_id, i.sheet_key ?? ""), i.id]));
  for (const c of ip.create) {
    const id = createdItemsByKey.get(c.ref);
    if (id) itemIds.set(c.ref, id);
  }
  const itemsById = new Map(snapshot.items.map((i) => [i.id, i]));
  const itemUpdates = new Map<string, Partial<DbItem>>();
  for (const next of ip.update) itemUpdates.set(next.id, changed(next, itemsById.get(next.id) ?? next, ITEM_FIELDS));
  for (const [ref, url] of itemPhotos) if (itemsById.has(ref)) itemUpdates.set(ref, { ...itemUpdates.get(ref), image_url: url });
  for (const [id, patch] of itemUpdates) if (Object.keys(patch).length === 0) itemUpdates.delete(id);
  await applyPatches<DbItem>("items", itemUpdates, itemRow);
  report.items.created = createdItems.length;
  report.items.updated = itemUpdates.size;

  // 4. Наличие и цены точки — по свежему наличию из базы, а не по снимку из начала синхронизации:
  // пока копировались фото, в админке могли переключить наличие или цену. Пишутся только колонки,
  // которые поменяла таблица.
  const fresh: DbSnapshot = { ...snapshot, stock: await selectAll<DbStock>("item_stock", { order: "item_id.asc,store_id.asc" }) };
  const sp = planStock(lines, itemIds, lineIds, fresh, ctx);
  await writeStock(sp.upsert);

  // 5. Что убрали из таблицы: строки наличия точки, а позиции и линейки из таблицы, которые больше нигде
  // не продаются, — целиком. Сначала копия в «Недавно удалённые»: без неё ничего не удаляем.
  let removeStock = sp.remove;
  let journaled = false;
  let cleanup = planCleanup(fresh, { storeId, itemIds: removeStock }, { lines: new Set(lineIds.values()), items: new Set(itemIds.values()) }, ctx);
  if (removeStock.length || cleanup.items.length || cleanup.lines.length) {
    const drafts = removalDrafts(fresh, { storeId, stockItemIds: removeStock, items: cleanup.items, lines: cleanup.lines }, "sheet");
    const saved = await journal(drafts).catch((error) => {
      console.error(`[sync] «${store.title}»: не удалось сохранить копию удаляемого — удаление отложено:`, error);
      return null;
    });
    if (saved === null) {
      removeStock = [];
      cleanup = { items: [], lines: [] };
    }
    journaled = !!saved && saved.ids.length > 0;
  }
  if (removeStock.length) await removeIn("item_stock", "item_id", removeStock, { store_id: `eq.${storeId}` });
  if (cleanup.items.length) await removeIn("items", "id", cleanup.items);
  if (cleanup.lines.length) await removeIn("product_lines", "id", cleanup.lines);
  const deferred = removeStock.length < sp.remove.length;
  report.stock = {
    added: sp.added,
    updated: sp.updated,
    removed: removeStock.length,
    removalSkipped: sp.removalSkipped || deferred,
    journaled,
    ...(sp.skipReason ? { skipReason: sp.skipReason } : deferred && { skipReason: "journal" as const }),
  };
  if (sp.removalSkipped) console.warn(`[sync] «${store.title}»: удаление пропущено (${sp.skipReason}) — таблица могла прочитаться не целиком`);
  report.items.removed = cleanup.items.length;
  report.lines.removed = cleanup.lines.length;

  report.changed =
    newCategories.length > 0 ||
    report.lines.created + report.lines.updated + report.lines.removed > 0 ||
    report.items.created + report.items.updated + report.items.removed > 0 ||
    report.stock.added + report.stock.updated + report.stock.removed > 0;

  return { report, sheets, snapshot: report.changed ? null : fresh };
}

/** Синхронизирует все точки «от таблицы». Ошибка одной точки не мешает другой. */
export async function syncAll(options: SyncOptions = {}): Promise<{ storeId: string; report?: SyncReport; skipped?: boolean; error?: string }[]> {
  const settings = await loadSettings();
  if (!settings?.mirror) return [];
  const stores = storeInfos.filter((s) => sourceOf(settings, s.id) === "sheet");
  const results = [];
  for (const { id } of stores) {
    try {
      const result = await syncStore(id, options);
      results.push(result ? { storeId: id, report: result.report } : { storeId: id, skipped: true });
    } catch (error) {
      console.error(`[sync] «${id}»:`, error);
      results.push({ storeId: id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

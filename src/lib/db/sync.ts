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
  type SyncContext,
} from "./sync-plan";
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
const stockRow = (s: DbStock) => ({
  item_id: s.item_id,
  store_id: s.store_id,
  price: s.price,
  old_price: s.old_price,
  in_stock: s.in_stock,
  sheet_status: s.sheet_status ?? null,
  sheet_price: s.sheet_price ?? null,
});

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
  stock: { added: number; updated: number; removed: number; removalSkipped: boolean; skipReason?: "mass" | "partial" };
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
  const lineUpdates = new Map(lp.update.map((l) => [l.id, l]));
  const linesById = new Map(snapshot.lines.map((l) => [l.id, l]));
  for (const [ref, url] of linePhotos) {
    const base = lineUpdates.get(ref) ?? linesById.get(ref);
    if (base) lineUpdates.set(ref, { ...base, image_url: url });
  }
  await insertBatched("product_lines", [...lineUpdates.values()].map(lineRow), "id");
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
  const itemUpdates = new Map(ip.update.map((i) => [i.id, i]));
  const itemsById = new Map(snapshot.items.map((i) => [i.id, i]));
  for (const [ref, url] of itemPhotos) {
    const base = itemUpdates.get(ref) ?? itemsById.get(ref);
    if (base) itemUpdates.set(ref, { ...base, image_url: url });
  }
  await insertBatched("items", [...itemUpdates.values()].map(itemRow), "id");
  report.items.created = createdItems.length;
  report.items.updated = itemUpdates.size;

  // 4. Наличие и цены точки.
  const sp = planStock(lines, itemIds, lineIds, snapshot, ctx);
  await insertBatched("item_stock", sp.upsert.map(stockRow), "item_id,store_id");
  if (sp.remove.length) await removeIn("item_stock", "item_id", sp.remove, { store_id: `eq.${storeId}` });
  report.stock = {
    added: sp.added,
    updated: sp.updated,
    removed: sp.remove.length,
    removalSkipped: sp.removalSkipped,
    ...(sp.skipReason && { skipReason: sp.skipReason }),
  };
  if (sp.removalSkipped) console.warn(`[sync] «${store.title}»: удаление пропущено (${sp.skipReason}) — таблица могла прочитаться не целиком`);

  // 5. Уборка: позиции и линейки из таблицы, которые больше нигде не продаются.
  const cleanup = planCleanup(snapshot, { storeId, itemIds: sp.remove }, { lines: new Set(lineIds.values()), items: new Set(itemIds.values()) }, ctx);
  if (cleanup.items.length) await removeIn("items", "id", cleanup.items);
  if (cleanup.lines.length) await removeIn("product_lines", "id", cleanup.lines);
  report.items.removed = cleanup.items.length;
  report.lines.removed = cleanup.lines.length;

  report.changed =
    newCategories.length > 0 ||
    report.lines.created + report.lines.updated + report.lines.removed > 0 ||
    report.items.created + report.items.updated + report.items.removed > 0 ||
    report.stock.added + report.stock.updated + report.stock.removed > 0;

  return { report, sheets, snapshot: report.changed ? null : snapshot };
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

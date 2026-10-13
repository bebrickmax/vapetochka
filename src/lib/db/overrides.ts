import type { OverrideCleanup, SheetOverride } from "@/lib/overrides";
import { DbError, inList, insert, isDbConfigured, remove, selectAll } from "./supabase";

/*
 * Настройки точек и правки поверх таблицы в базе.
 * Если таблиц ещё нет (schema.sql не перезапущен после обновления) — функции
 * возвращают null, и сайт работает как раньше.
 */

export type StoreSource = "sheet" | "db";

/** Таблицы нет в базе: PostgREST отвечает 404. */
const isMissingTable = (error: unknown) => error instanceof DbError && error.status === 404;

export const SCHEMA_HINT = "Обновите базу: в Supabase → SQL Editor выполните supabase/schema.sql ещё раз.";

/** Источник каждой точки (нет строки — «таблица»). null — таблицы настроек нет. */
export async function loadStoreSources(): Promise<Record<string, StoreSource> | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await selectAll<{ store_id: string; source: StoreSource }>("store_settings");
    return Object.fromEntries(rows.map((r) => [r.store_id, r.source]));
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export async function setStoreSource(storeId: string, source: StoreSource): Promise<void> {
  await insert("store_settings", { store_id: storeId, source }, { onConflict: "store_id" });
}

/** Правки точки. null — таблицы правок нет. */
export async function loadOverrides(storeId: string): Promise<SheetOverride[] | null> {
  if (!isDbConfigured()) return null;
  try {
    return await selectAll<SheetOverride>("sheet_overrides", { store_id: `eq.${storeId}` });
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

const CHUNK = 150;
const COLUMNS = ["store_id", "product_id", "in_stock", "sheet_status", "price_set", "price", "sheet_price"] as const;
const pick = (row: SheetOverride) => Object.fromEntries(COLUMNS.map((c) => [c, row[c]]));

export async function saveOverrides(rows: SheetOverride[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500)
    await insert("sheet_overrides", rows.slice(i, i + 500).map(pick), { onConflict: "store_id,product_id" });
}

export async function removeOverrides(storeId: string, productIds?: string[]): Promise<void> {
  if (!productIds) return remove("sheet_overrides", { store_id: `eq.${storeId}` });
  for (let i = 0; i < productIds.length; i += CHUNK)
    await remove("sheet_overrides", { store_id: `eq.${storeId}`, product_id: inList(productIds.slice(i, i + CHUNK)) });
}

/** Убирает устаревшие правки (их клетку уже поменяли в таблице). */
export async function cleanupOverrides(storeId: string, cleanup: OverrideCleanup): Promise<void> {
  if (cleanup.remove.length) await removeOverrides(storeId, cleanup.remove);
  if (cleanup.update.length) await saveOverrides(cleanup.update);
}

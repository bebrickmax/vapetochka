import type { OverrideCleanup, SheetOverride } from "@/lib/overrides";
import { DbError, inList, insert, isDbConfigured, remove, selectAll } from "./supabase";

/*
 * Быстрые правки поверх таблицы (запасной режим витрины, пока в базе нет колонок зеркала таблицы).
 * Если таблицы правок нет — функции возвращают null, и сайт показывает саму таблицу.
 */

/** Таблицы нет в базе: PostgREST отвечает 404. */
const isMissingTable = (error: unknown) => error instanceof DbError && error.status === 404;

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

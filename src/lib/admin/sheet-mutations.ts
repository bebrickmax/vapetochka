import { getStore } from "@/config/stores";
import { getSheetCatalog } from "@/lib/catalog";
import { loadOverrides, loadStoreSources, removeOverrides, saveOverrides, SCHEMA_HINT, setStoreSource, type StoreSource } from "@/lib/db/overrides";
import { selectAll } from "@/lib/db/supabase";
import { nextOverride, sheetValues, type SheetOverride } from "@/lib/overrides";
import { AdminError } from "./api";

/*
 * Правки наличия и цен поверх Google Таблицы и переключение источника точки.
 */

function storeId(value: unknown): string {
  if (typeof value !== "string" || !getStore(value)) throw new AdminError("Неизвестная точка");
  return value;
}

function productId(value: unknown): string {
  if (typeof value !== "string" || !/^[\w-]{1,160}$/.test(value)) throw new AdminError("Неверный id");
  return value;
}

function price(value: unknown): number | null {
  if (value === null || value === "" || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new AdminError("Проверьте цену");
  return Math.round(n * 100) / 100;
}

async function overridesOrHint(store: string): Promise<SheetOverride[]> {
  const rows = await loadOverrides(store);
  if (rows === null) throw new AdminError(SCHEMA_HINT, 409);
  return rows;
}

export interface OverrideUpdate {
  itemId: string;
  inStock?: boolean;
  price?: number | string | null;
}

/** Наличие/цена поверх таблицы. Значение, как в таблице, снимает правку. */
export async function updateOverrides(rawStore: unknown, raw: unknown): Promise<number> {
  const store = storeId(rawStore);
  if (!Array.isArray(raw) || raw.length === 0) throw new AdminError("Нет изменений");
  if (raw.length > 5000) throw new AdminError("Слишком много позиций за раз");

  const [catalog, existing] = await Promise.all([getSheetCatalog(store), overridesOrHint(store)]);
  const values = sheetValues(catalog.groups);
  const current = new Map(existing.map((o) => [o.product_id, o]));
  const save: SheetOverride[] = [];
  const drop: string[] = [];

  for (const u of raw as OverrideUpdate[]) {
    const id = productId(u.itemId);
    const base = values.get(id);
    if (!base) throw new AdminError("Товар не найден в таблице — обновите страницу админки");
    const change: { inStock?: boolean; price?: number | null } = {};
    if (u.inStock !== undefined) {
      if (typeof u.inStock !== "boolean") throw new AdminError("Неверное наличие");
      change.inStock = u.inStock;
    }
    if (u.price !== undefined) change.price = price(u.price);
    const row = nextOverride(current.get(id), { storeId: store, productId: id, ...base }, change);
    if (row) save.push(row);
    else if (current.has(id)) drop.push(id);
  }

  if (save.length) await saveOverrides(save);
  if (drop.length) await removeOverrides(store, drop);
  return save.length + drop.length;
}

/** «Как в таблице»: снимает правки с позиций (или со всей точки). */
export async function resetOverrides(rawStore: unknown, rawIds: unknown): Promise<void> {
  const store = storeId(rawStore);
  await overridesOrHint(store);
  if (rawIds === undefined || rawIds === null) return removeOverrides(store);
  if (!Array.isArray(rawIds)) throw new AdminError("Неверный список");
  await removeOverrides(store, rawIds.map(productId));
}

/** Откуда точка берёт товары. «Админка» — только если в базе уже есть товары этой точки. */
export async function changeStoreSource(rawStore: unknown, rawSource: unknown): Promise<StoreSource> {
  const store = storeId(rawStore);
  if (rawSource !== "sheet" && rawSource !== "db") throw new AdminError("Неизвестный режим");
  if ((await loadStoreSources()) === null) throw new AdminError(SCHEMA_HINT, 409);
  if (rawSource === "db") {
    const stock = await selectAll("item_stock", { store_id: `eq.${store}`, limit: 1 });
    if (stock.length === 0) throw new AdminError("Сначала перенесите товары этой точки в админку (Импорт)");
  }
  await setStoreSource(store, rawSource);
  return rawSource;
}

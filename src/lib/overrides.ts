/*
 * Быстрые правки из админки поверх Google Таблицы (режим точки «таблица»).
 *
 * Правило «кто изменил последним, тот и прав»: вместе с правкой хранится значение
 * таблицы на момент правки. Пока таблица показывает то же самое — действует правка.
 * Поменяли эту клетку в таблице — правка устаревает: побеждает таблица, а правку
 * нужно удалить (иначе она «воскреснет», если в таблице вернут прежнее значение).
 */

import { toProduct } from "@/lib/products";
import type { ProductGroup, StockStatus } from "@/lib/types";

export interface SheetOverride {
  store_id: string;
  product_id: string;
  in_stock: boolean | null;
  sheet_status: StockStatus | null;
  price_set: boolean;
  price: number | string | null;
  sheet_price: number | string | null;
}

/** Что админка показывает про позицию точки, работающей от таблицы. */
export interface SheetInfo {
  /** Наличие и цена, как в таблице. */
  inStock: boolean;
  price: number | null;
  /** Действует правка наличия / цены из админки. */
  stockOverridden: boolean;
  priceOverridden: boolean;
}

export function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export const samePrice = (a: number | string | null | undefined, b: number | string | null | undefined) => num(a) === num(b);

/** «В наличии» по отметке таблицы: без отметки — считаем, что есть. */
export const sheetInStock = (status: StockStatus) => status !== "out";

export interface OverrideCleanup {
  /** Правки, которые устарели целиком. */
  remove: string[];
  /** Правки, у которых устарела одна часть (наличие или цена). */
  update: SheetOverride[];
}

export interface AppliedOverrides {
  groups: ProductGroup[];
  /** id товара → что сейчас переопределено. */
  active: Map<string, { stock: boolean; price: boolean }>;
  cleanup: OverrideCleanup;
}

/** Накладывает правки на линейки из таблицы. Исходные группы не меняются. */
export function applyOverrides(groups: ProductGroup[], overrides: SheetOverride[]): AppliedOverrides {
  const byId = new Map(overrides.map((o) => [o.product_id, o]));
  const active = new Map<string, { stock: boolean; price: boolean }>();
  const seen = new Set<string>();
  const cleanup: OverrideCleanup = { remove: [], update: [] };

  const result = groups.map((group) => {
    let changed = false;
    const items = group.items.map((item, index) => {
      const id = toProduct(group, index).id;
      const o = byId.get(id);
      if (!o) return item;
      seen.add(id);

      const stockSet = o.in_stock !== null && o.in_stock !== undefined;
      const stockValid = stockSet && o.sheet_status === item.status;
      const priceValid = o.price_set && samePrice(o.sheet_price, item.price);

      if ((stockSet && !stockValid) || (o.price_set && !priceValid)) {
        if (!stockValid && !priceValid) cleanup.remove.push(id);
        else
          cleanup.update.push({
            ...o,
            ...(!stockValid && { in_stock: null, sheet_status: null }),
            ...(!priceValid && { price_set: false, price: null, sheet_price: null }),
          });
      }
      if (!stockValid && !priceValid) return item;

      active.set(id, { stock: stockValid, price: priceValid });
      changed = true;
      return {
        ...item,
        ...(stockValid && { status: (o.in_stock ? "in" : "out") as StockStatus }),
        ...(priceValid && { price: num(o.price) }),
      };
    });
    return changed ? { ...group, items } : group;
  });

  // Товара больше нет в таблице — правка не нужна.
  for (const o of overrides) if (!seen.has(o.product_id)) cleanup.remove.push(o.product_id);
  return { groups: result, active, cleanup };
}

/** Значения таблицы по id товара — для записи правок. */
export function sheetValues(groups: ProductGroup[]): Map<string, { status: StockStatus; price: number | null }> {
  const map = new Map<string, { status: StockStatus; price: number | null }>();
  for (const group of groups)
    group.items.forEach((item, index) => map.set(toProduct(group, index).id, { status: item.status, price: num(item.price) }));
  return map;
}

/**
 * Новая строка правки после изменения в админке. Значение, совпадающее с таблицей,
 * снимает правку (null — правок не осталось, строку можно удалить).
 */
export function nextOverride(
  current: SheetOverride | undefined,
  base: { storeId: string; productId: string; status: StockStatus; price: number | null },
  change: { inStock?: boolean; price?: number | null },
): SheetOverride | null {
  const row: SheetOverride = current
    ? { ...current }
    : { store_id: base.storeId, product_id: base.productId, in_stock: null, sheet_status: null, price_set: false, price: null, sheet_price: null };

  if (change.inStock !== undefined) {
    if (change.inStock === sheetInStock(base.status)) Object.assign(row, { in_stock: null, sheet_status: null });
    else Object.assign(row, { in_stock: change.inStock, sheet_status: base.status });
  }
  if (change.price !== undefined) {
    if (samePrice(change.price, base.price)) Object.assign(row, { price_set: false, price: null, sheet_price: null });
    else Object.assign(row, { price_set: true, price: change.price, sheet_price: base.price });
  }
  return row.in_stock === null && !row.price_set ? null : row;
}

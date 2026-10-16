import type { StoreSource } from "@/lib/db/sync";
import type { DbCategory, DbItem, DbLine, DbStock } from "@/lib/db/types";
import { num, sheetInStock } from "@/lib/overrides";
import { toPrice } from "@/lib/db/types";
import { matches, normalize, parseQuery } from "@/lib/search";
import { alphabeticalOrderByLine } from "@/lib/sort";

/** Данные админки — как их отдаёт GET /api/admin/catalog. */
export interface AdminData {
  stores: { id: string; title: string; short?: string }[];
  categories: DbCategory[];
  lines: DbLine[];
  items: DbItem[];
  stock: DbStock[];
  /** Откуда каждая точка берёт товары: «от таблицы» (база синхронизируется с Google Таблицей) или «от админки». */
  sources: Record<string, StoreSource>;
  /** Время последней синхронизации с таблицей. */
  syncedAt: Record<string, string | null>;
  /** В базе есть всё для синхронизации с таблицей (schema.sql обновлён). */
  schemaReady: boolean;
  /** Что умеет база: newBadge — есть колонка метки «Новинка». */
  features?: { newBadge: boolean };
}

/**
 * Что пришло из таблицы и поэтому меняется в таблице: позиции, которые синхронизация ведёт
 * в точках «от таблицы», и их линейки. Наличие, цена и фото у них правятся и здесь.
 */
export function sheetLocks(data: AdminData): { items: Set<string>; lines: Set<string> } {
  const items = new Set<string>();
  if (data.schemaReady)
    for (const s of data.stock) if (s.sheet_status && data.sources[s.store_id] === "sheet") items.add(s.item_id);
  const lines = new Set(data.items.filter((i) => items.has(i.id)).map((i) => i.line_id));
  return { items, lines };
}

/**
 * Отличается ли позиция от таблицы (правка из админки ещё действует).
 * null — позиция не из таблицы или точка работает от админки.
 */
export function sheetDiff(data: AdminData, stock: DbStock): { stock: boolean; price: boolean; inStock: boolean; sheetPrice: number | null } | null {
  if (!stock.sheet_status || data.sources[stock.store_id] !== "sheet") return null;
  const inStock = sheetInStock(stock.sheet_status);
  const sheetPrice = num(stock.sheet_price);
  return { stock: stock.in_stock !== inStock, price: num(stock.price) !== sheetPrice, inStock, sheetPrice };
}

export const stockKey = (itemId: string, storeId: string) => `${itemId}|${storeId}`;

export interface ItemView {
  item: DbItem;
  stock: DbStock;
  price: number | null;
}

export interface LineView {
  line: DbLine;
  category?: DbCategory;
  /** Все позиции линейки в выбранной точке. */
  all: ItemView[];
  /** Прошедшие фильтры. */
  visible: ItemView[];
  inStock: number;
  /** Самая частая цена в линейке. */
  price: number | null;
}

export interface Filters {
  storeId: string;
  query: string;
  categoryId: string; // "" — все
  brand: string; // "" — все
  status: "all" | "in" | "out" | "new";
}

function commonPrice(items: ItemView[]): number | null {
  const counts = new Map<number, number>();
  for (const { price } of items) if (price !== null) counts.set(price, (counts.get(price) ?? 0) + 1);
  let best: number | null = null;
  let max = 0;
  for (const [p, c] of counts) if (c > max) [best, max] = [p, c];
  return best;
}

/** Линейки выбранной точки с учётом поиска и фильтров (в порядке витрины). */
export function buildView(data: AdminData, filters: Filters): LineView[] {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const categoryOrder = new Map(data.categories.map((c) => [c.id, c.sort]));
  const stock = new Map<string, DbStock>();
  for (const s of data.stock) if (s.store_id === filters.storeId) stock.set(s.item_id, s);

  const itemsByLine = new Map<string, ItemView[]>();
  for (const item of data.items) {
    const s = stock.get(item.id);
    if (!s) continue;
    const list = itemsByLine.get(item.line_id) ?? [];
    list.push({ item, stock: s, price: toPrice(s.price) });
    itemsByLine.set(item.line_id, list);
  }

  const query = parseQuery(filters.query);
  const searching = filters.query.trim().length > 0;

  const lines = data.lines
    .filter((line) => itemsByLine.has(line.id))
    .filter((line) => !filters.categoryId || line.category_id === filters.categoryId)
    .filter((line) => !filters.brand || (line.brand ?? "") === filters.brand)
    .sort(
      (a, b) =>
        (categoryOrder.get(a.category_id) ?? 0) - (categoryOrder.get(b.category_id) ?? 0) || a.sort - b.sort,
    );

  const result: LineView[] = [];
  for (const line of lines) {
    const category = categories.get(line.category_id);
    const all = itemsByLine.get(line.id)!.sort((a, b) => a.item.sort - b.item.sort);
    const lineText = normalize([line.brand, line.name, line.section, category?.title].filter(Boolean).join(" "));
    const lineMatches = searching && matches(lineText, query);
    const visible = all.filter((v) => {
      if (filters.status === "in" && !v.stock.in_stock) return false;
      if (filters.status === "out" && v.stock.in_stock) return false;
      if (filters.status === "new" && !line.is_new && !v.item.is_new) return false;
      if (!searching || lineMatches) return true;
      return matches(normalize(`${lineText} ${v.item.title} ${v.item.variant ?? ""}`), query);
    });
    if (visible.length === 0) continue;
    result.push({
      line,
      category,
      all,
      visible,
      inStock: all.filter((v) => v.stock.in_stock).length,
      price: commonPrice(all),
    });
  }
  return result;
}

/** Бренды (для фильтра и подсказок) — в порядке появления. */
export function brandsOf(data: AdminData, categoryId = ""): string[] {
  const set = new Set<string>();
  for (const line of data.lines) {
    if (categoryId && line.category_id !== categoryId) continue;
    if (line.brand) set.add(line.brand);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

// ─── Оптимистичные изменения локальных данных ───────────────────────────────

export function patchStock(
  data: AdminData,
  storeId: string,
  itemIds: string[],
  patch: Partial<Pick<DbStock, "in_stock" | "price">>,
): AdminData {
  const ids = new Set(itemIds);
  return {
    ...data,
    stock: data.stock.map((s) => (s.store_id === storeId && ids.has(s.item_id) ? { ...s, ...patch } : s)),
  };
}

export function patchItem(data: AdminData, id: string, patch: Partial<DbItem>): AdminData {
  return { ...data, items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

export function patchLine(data: AdminData, id: string, patch: Partial<DbLine>): AdminData {
  return { ...data, lines: data.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Вкусы по алфавиту — так же, как это сделает сервер (без lineIds — во всех линейках). */
export function sortItems(data: AdminData, lineIds?: string[]): AdminData {
  const order = alphabeticalOrderByLine(data.items, lineIds ? new Set(lineIds) : undefined);
  if (order.size === 0) return data;
  return { ...data, items: data.items.map((i) => (order.has(i.id) ? { ...i, sort: order.get(i.id)! } : i)) };
}

export function removeItem(data: AdminData, id: string): AdminData {
  return { ...data, items: data.items.filter((i) => i.id !== id), stock: data.stock.filter((s) => s.item_id !== id) };
}

export function removeLine(data: AdminData, id: string): AdminData {
  const itemIds = new Set(data.items.filter((i) => i.line_id === id).map((i) => i.id));
  return {
    ...data,
    lines: data.lines.filter((l) => l.id !== id),
    items: data.items.filter((i) => !itemIds.has(i.id)),
    stock: data.stock.filter((s) => !itemIds.has(s.item_id)),
  };
}

export const formatPrice = (p: number | null) => (p === null ? "—" : `${Number.isInteger(p) ? p : p.toFixed(2).replace(".", ",")} BYN`);

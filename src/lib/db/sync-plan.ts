/*
 * Синхронизация «Google Таблица → база» — чистая логика без запросов (её легко проверить тестами).
 *
 * База — зеркало таблицы, в которое админка может добавлять своё:
 *  • линейки и позиции из таблицы узнаются по ключу (раздел + бренд + название / вкус + вариант);
 *  • новые в таблице — создаются, исчезнувшие из таблицы — убираются из точки;
 *  • наличие и цена: «кто изменил последним, тот и прав» — у строки наличия хранится значение
 *    таблицы с прошлой синхронизации; таблица перезаписывает базу, только если её значение изменилось;
 *  • то, что добавлено в админке (без ключа таблицы), синхронизация не трогает.
 */

import { assignFamilies } from "@/lib/brands";
import { num, sheetInStock } from "@/lib/overrides";
import type { StockStatus } from "@/lib/types";
import type { ImportCategory } from "./import";
import { itemTitle } from "./import";
import type { DbCategory, DbItem, DbLine, DbSnapshot, DbStock } from "./types";

export const norm = (text: string | null | undefined) =>
  (text ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Ключи списка с номером для повторов: «a», «a#2», «a#3». */
function withRepeats(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  });
}

export const lineBaseKey = (l: { section?: string | null; brand?: string | null; name: string }) =>
  [norm(l.section), norm(l.brand), norm(l.name)].join("|");
export const itemBaseKey = (i: { title: string; variant?: string | null }) => [norm(i.title), norm(i.variant)].join("|");

export interface SheetItem {
  key: string;
  title: string;
  variant: string | null;
  image: string | null;
  status: StockStatus;
  price: number | null;
  oldPrice: number | null;
  sort: number;
}

export interface SheetLine {
  categoryId: string;
  key: string;
  name: string;
  brand: string | null;
  section: string | null;
  note: string | null;
  image: string | null;
  sort: number;
  items: SheetItem[];
}

/** Таблица точки → категории и линейки с ключами. */
export function sheetLines(categories: ImportCategory[]): { categories: DbCategory[]; lines: SheetLine[] } {
  const lines: SheetLine[] = [];
  for (const category of categories) {
    const families = assignFamilies(category.groups);
    const drafts = category.groups.map((group, index) => ({
      group,
      brand: families[index] || group.brand || null,
    }));
    const keys = withRepeats(drafts.map(({ group, brand }) => lineBaseKey({ section: group.section, brand, name: group.line })));
    drafts.forEach(({ group, brand }, index) => {
      const items = group.items.map((item) => ({ item, title: itemTitle(item) }));
      const itemKeys = withRepeats(items.map(({ item, title }) => itemBaseKey({ title, variant: item.variant })));
      lines.push({
        categoryId: category.id,
        key: keys[index],
        name: group.line,
        brand,
        section: group.section ?? null,
        note: group.note ?? null,
        image: group.image ?? null,
        sort: (index + 1) * 10,
        items: items.map(({ item, title }, i) => ({
          key: itemKeys[i],
          title,
          variant: item.variant ?? null,
          image: item.image && item.image !== group.image ? item.image : null,
          status: item.status,
          price: num(item.price),
          oldPrice: num(item.oldPrice),
          sort: (i + 1) * 10,
        })),
      });
    });
  }
  return {
    categories: categories.map(({ id, title, sort }) => ({ id, title, sort })),
    lines,
  };
}

export interface SyncContext {
  storeId: string;
  /**
   * Точки важнее этой (раньше в списке точек). Порядок линеек и вкусов, которые продаются и там,
   * задают они — синхронизация этой точки его не трогает.
   */
  priorStores: string[];
  /** Первая синхронизация точки: всё, чего нет в таблице, — старые данные, их можно убрать. */
  first: boolean;
  /** Наличие и цены — строго как в таблице (полная замена). */
  force: boolean;
  /** Только добавить новое, существующее не трогать. */
  onlyNew: boolean;
}

/** Строка, которой нужно фото из таблицы (копирование — снаружи, с лимитом). */
export interface PhotoNeed {
  kind: "line" | "item";
  /** Ключ строки в плане (для создаваемых) или id (для существующих). */
  ref: string;
  url: string;
}

const lineRef = (categoryId: string, key: string) => `${categoryId}::${key}`;

// ─── Линейки ────────────────────────────────────────────────────────────────

export interface LinePlan {
  /** ref таблицы → id существующей линейки (созданные добавятся после записи). */
  resolved: Map<string, string>;
  create: { ref: string; row: Omit<DbLine, "id"> }[];
  update: DbLine[];
  photos: PhotoNeed[];
}

/** Позиции, которые продаются в более важных точках (их порядок задают те точки). */
function itemsInPrior(stock: DbStock[], prior: string[]): Set<string> {
  const stores = new Set(prior);
  const set = new Set<string>();
  for (const s of stock) if (stores.has(s.store_id)) set.add(s.item_id);
  return set;
}

export function planLines(sheet: SheetLine[], snapshot: DbSnapshot, ctx: SyncContext): LinePlan {
  const byKey = new Map<string, DbLine>();
  const adoptable = new Map<string, DbLine[]>();
  for (const line of snapshot.lines) {
    if (line.sheet_key) byKey.set(lineRef(line.category_id, line.sheet_key), line);
  }
  // Линейки без ключа (перенесённые раньше обычным импортом) «узнаём» по названию.
  const seenBase = new Map<string, number>();
  for (const line of snapshot.lines) {
    if (line.sheet_key) continue;
    const base = lineRef(line.category_id, lineBaseKey(line));
    const n = (seenBase.get(base) ?? 0) + 1;
    seenBase.set(base, n);
    const ref = n === 1 ? base : `${base}#${n}`;
    if (!byKey.has(ref)) adoptable.set(ref, [...(adoptable.get(ref) ?? []), line]);
  }

  const prior = itemsInPrior(snapshot.stock, ctx.priorStores);
  const linesInPrior = new Set(snapshot.items.filter((i) => prior.has(i.id)).map((i) => i.line_id));
  const ownsSort = (lineId: string) => !linesInPrior.has(lineId);

  const plan: LinePlan = { resolved: new Map(), create: [], update: [], photos: [] };
  for (const line of sheet) {
    const ref = lineRef(line.categoryId, line.key);
    let existing = byKey.get(ref);
    let adopted = false;
    if (!existing) {
      const candidates = adoptable.get(ref);
      if (candidates?.length) {
        existing = candidates.shift();
        adopted = true;
      }
    }
    if (!existing) {
      plan.create.push({
        ref,
        row: {
          category_id: line.categoryId,
          name: line.name,
          brand: line.brand,
          section: line.section,
          note: line.note,
          image_url: null,
          sort: line.sort,
          sheet_key: line.key,
        },
      });
      if (line.image) plan.photos.push({ kind: "line", ref, url: line.image });
      continue;
    }
    plan.resolved.set(ref, existing.id);
    if (ctx.onlyNew && !adopted) continue;

    const next: DbLine = {
      ...existing,
      name: line.name,
      brand: line.brand,
      section: line.section,
      note: line.note,
      sheet_key: line.key,
      ...(ownsSort(existing.id) && { sort: line.sort }),
    };
    if (
      adopted ||
      next.name !== existing.name ||
      next.brand !== existing.brand ||
      next.section !== existing.section ||
      next.note !== existing.note ||
      next.sort !== existing.sort
    )
      plan.update.push(next);
    if (!existing.image_url && line.image) plan.photos.push({ kind: "line", ref: existing.id, url: line.image });
  }
  return plan;
}

// ─── Позиции ────────────────────────────────────────────────────────────────

export interface ItemPlan {
  /** «ref линейки::ключ позиции» → id существующей позиции. */
  resolved: Map<string, string>;
  create: { ref: string; row: Omit<DbItem, "id"> }[];
  update: DbItem[];
  photos: PhotoNeed[];
}

export const itemRef = (lineId: string, key: string) => `${lineId}::${key}`;

export function planItems(
  sheet: SheetLine[],
  lineIds: Map<string, string>,
  snapshot: DbSnapshot,
  ctx: SyncContext,
): ItemPlan {
  const byKey = new Map<string, DbItem>();
  const adoptable = new Map<string, DbItem[]>();
  for (const item of snapshot.items) if (item.sheet_key) byKey.set(itemRef(item.line_id, item.sheet_key), item);
  const seenBase = new Map<string, number>();
  for (const item of [...snapshot.items].sort((a, b) => a.sort - b.sort)) {
    if (item.sheet_key) continue;
    const base = itemRef(item.line_id, itemBaseKey(item));
    const n = (seenBase.get(base) ?? 0) + 1;
    seenBase.set(base, n);
    const ref = n === 1 ? base : `${base}#${n}`;
    if (!byKey.has(ref)) adoptable.set(ref, [...(adoptable.get(ref) ?? []), item]);
  }
  const prior = itemsInPrior(snapshot.stock, ctx.priorStores);
  const ownsSort = (itemId: string) => !prior.has(itemId);

  const plan: ItemPlan = { resolved: new Map(), create: [], update: [], photos: [] };
  for (const line of sheet) {
    const lineId = lineIds.get(lineRef(line.categoryId, line.key));
    if (!lineId) continue;
    for (const item of line.items) {
      const ref = itemRef(lineId, item.key);
      let existing = byKey.get(ref);
      let adopted = false;
      if (!existing) {
        const candidates = adoptable.get(ref);
        if (candidates?.length) {
          existing = candidates.shift();
          adopted = true;
        }
      }
      if (!existing) {
        plan.create.push({
          ref,
          row: { line_id: lineId, title: item.title, variant: item.variant, image_url: null, sort: item.sort, sheet_key: item.key },
        });
        if (item.image) plan.photos.push({ kind: "item", ref, url: item.image });
        continue;
      }
      plan.resolved.set(ref, existing.id);
      if (ctx.onlyNew && !adopted) continue;
      const next: DbItem = {
        ...existing,
        title: item.title,
        variant: item.variant,
        sheet_key: item.key,
        ...(ownsSort(existing.id) && { sort: item.sort }),
      };
      if (adopted || next.title !== existing.title || next.variant !== existing.variant || next.sort !== existing.sort)
        plan.update.push(next);
      if (!existing.image_url && item.image) plan.photos.push({ kind: "item", ref: existing.id, url: item.image });
    }
  }
  return plan;
}

// ─── Наличие и цены точки ───────────────────────────────────────────────────

export interface StockPlan {
  upsert: DbStock[];
  /** id позиций, которые больше не продаются в точке (их нет в таблице). */
  remove: string[];
  added: number;
  updated: number;
  /** Убирать подозрительно много — пропускаем удаление (таблица могла прочитаться не целиком). */
  removalSkipped: boolean;
}

export function planStock(
  sheet: SheetLine[],
  itemIds: Map<string, string>,
  lineIds: Map<string, string>,
  snapshot: DbSnapshot,
  ctx: SyncContext,
): StockPlan {
  const current = new Map<string, DbStock>();
  for (const s of snapshot.stock) if (s.store_id === ctx.storeId) current.set(s.item_id, s);

  const plan: StockPlan = { upsert: [], remove: [], added: 0, updated: 0, removalSkipped: false };
  const inSheet = new Set<string>();
  for (const line of sheet) {
    const lineId = lineIds.get(lineRef(line.categoryId, line.key));
    if (!lineId) continue;
    for (const item of line.items) {
      const id = itemIds.get(itemRef(lineId, item.key));
      if (!id || inSheet.has(id)) continue;
      inSheet.add(id);
      const fromSheet: DbStock = {
        item_id: id,
        store_id: ctx.storeId,
        price: item.price,
        old_price: item.oldPrice,
        in_stock: sheetInStock(item.status),
        sheet_status: item.status,
        sheet_price: item.price,
      };
      const row = current.get(id);
      if (!row) {
        plan.upsert.push(fromSheet);
        plan.added++;
        continue;
      }
      if (ctx.onlyNew) continue;
      if (ctx.force || !row.sheet_status) {
        // Полная замена или позиция впервые связывается с таблицей — значения таблицы.
        const same =
          row.in_stock === fromSheet.in_stock &&
          num(row.price) === item.price &&
          num(row.old_price) === item.oldPrice &&
          row.sheet_status === item.status &&
          num(row.sheet_price) === item.price;
        if (!same) {
          plan.upsert.push(fromSheet);
          plan.updated++;
        }
        continue;
      }
      // «Кто последний, тот и прав»: таблица меняет только то, что в ней изменилось с прошлого раза.
      const next: DbStock = { ...pickStock(row) };
      let changed = false;
      if (row.sheet_status !== item.status) {
        Object.assign(next, { in_stock: sheetInStock(item.status), sheet_status: item.status });
        changed = true;
      }
      if (num(row.sheet_price) !== item.price) {
        Object.assign(next, { price: item.price, old_price: item.oldPrice, sheet_price: item.price });
        changed = true;
      }
      if (changed) {
        plan.upsert.push(next);
        plan.updated++;
      }
    }
  }

  if (!ctx.onlyNew) {
    // Из таблицы позицию убрали — она больше не продаётся в точке. Добавленное в админке не трогаем
    // (кроме первой синхронизации: тогда в базе только старый перенос из таблицы).
    const tracked = [...current.values()].filter((s) => s.sheet_status || ctx.first);
    const gone = tracked.filter((s) => !inSheet.has(s.item_id)).map((s) => s.item_id);
    if (gone.length > 20 && gone.length > tracked.length * 0.5) plan.removalSkipped = true;
    else plan.remove = gone;
  }
  return plan;
}

const pickStock = (s: DbStock): DbStock => ({
  item_id: s.item_id,
  store_id: s.store_id,
  price: num(s.price),
  old_price: num(s.old_price),
  in_stock: s.in_stock,
  sheet_status: s.sheet_status ?? null,
  sheet_price: num(s.sheet_price),
});

// ─── Уборка ────────────────────────────────────────────────────────────────

/**
 * Позиции и линейки из таблицы, которые больше нигде не продаются, — удаляем.
 * Добавленные в админке (без ключа таблицы) остаются, даже если сейчас ни в одной точке.
 */
export function planCleanup(
  snapshot: DbSnapshot,
  removedStock: { storeId: string; itemIds: string[] },
  keep: { lines: Set<string>; items: Set<string> },
  ctx: SyncContext,
) {
  const removed = new Set(removedStock.itemIds);
  const stockLeft = new Set<string>();
  for (const s of snapshot.stock) {
    if (s.store_id === removedStock.storeId && removed.has(s.item_id)) continue;
    stockLeft.add(s.item_id);
  }
  // Позиция без единой строки наличия нигде не показывается — это остаток. Добавленные в админке (без ключа)
  // трогаем только при первой синхронизации: в обычное время админка как раз может создавать их в эту секунду.
  const items = snapshot.items.filter(
    (i) => !stockLeft.has(i.id) && !keep.items.has(i.id) && (i.sheet_key || ctx.first || removed.has(i.id)),
  );
  const removedItems = new Set(items.map((i) => i.id));
  const linesWithItems = new Set(snapshot.items.filter((i) => !removedItems.has(i.id)).map((i) => i.line_id));
  const lines = snapshot.lines.filter((l) => !linesWithItems.has(l.id) && !keep.lines.has(l.id) && (l.sheet_key || ctx.first));
  return { items: [...removedItems], lines: lines.map((l) => l.id) };
}

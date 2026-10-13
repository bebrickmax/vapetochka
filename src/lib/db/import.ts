import { assignFamilies } from "@/lib/brands";
import { getStore } from "@/config/stores";
import { imageToken } from "@/lib/photos";
import { parseCsv } from "@/lib/sheets/csv";
import { categoryFromSheet, slugify } from "@/lib/sheets/categories";
import { parseSheet, type ParsedGroup } from "@/lib/sheets/parse";
import { fetchStoreSheets } from "@/lib/sheets/sources";
import type { ProductItem, RawSheet } from "@/lib/types";
import { sortLines } from "@/lib/admin/mutations";
import { loadSnapshot } from "./catalog";
import { inList, insert, remove, uploadPhoto } from "./supabase";
import type { DbCategory, DbItem, DbLine, DbStock } from "./types";

/*
 * Импорт ассортимента в базу из Google Таблицы точки (или CSV одного листа).
 *
 * Линейки и позиции общие для точек: «Skala 20mg — Банан» из обеих таблиц —
 * одна позиция с двумя строками наличия. Повторный импорт точки заменяет её
 * наличие и цены, но не трогает другую точку и ничего не дублирует.
 */

export interface ImportCategory {
  id: string;
  title: string;
  sort: number;
  groups: ParsedGroup[];
}

export interface ImportReport {
  storeId: string;
  mode: "replace" | "new";
  categories: number;
  lines: { total: number; created: number };
  /** addedToStore — сколько позиций получили наличие/цену в этой точке. */
  items: { total: number; created: number; addedToStore: number };
  photos: { copied: number; failed: number };
  /** Точка переведена на админку (полный перенос из таблицы). */
  switched?: boolean;
}

const norm = (text: string | null | undefined) => (text ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const lineKey = (categoryId: string, l: { section?: string | null; brand?: string | null; name: string }) =>
  [categoryId, norm(l.section), norm(l.brand), norm(l.name)].join("|");
const itemKey = (lineId: string, title: string, variant: string | null | undefined) =>
  [lineId, norm(title), norm(variant)].join("|");

/** Исходный текст позиции, как в таблице: «🍍❄️Ананас - Описание». */
export function itemTitle(item: Pick<ProductItem, "emoji" | "name" | "description">): string {
  return `${item.emoji ?? ""}${item.name}${item.description ? ` - ${item.description}` : ""}`;
}

/** Листы таблицы → категории с линейками (фото — исходные ссылки Google). */
export function categoriesFromSheets(sheets: RawSheet[]): ImportCategory[] {
  const result: ImportCategory[] = [];
  sheets.forEach((sheet, index) => {
    const meta = categoryFromSheet(sheet.title);
    const groups = parseSheet(sheet.rows, meta.id, sheet.images ?? {});
    if (groups.length === 0) return;
    const existing = result.find((c) => c.id === meta.id);
    if (existing) existing.groups.push(...groups);
    else result.push({ id: meta.id, title: meta.title, sort: (index + 1) * 10, groups });
  });
  return result;
}

/** CSV одного листа (Файл → Скачать → CSV) → одна категория. */
export function categoryFromCsv(categoryTitle: string, csv: string): ImportCategory[] {
  const meta = categoryFromSheet(categoryTitle);
  const id = meta.title === categoryTitle.trim() && meta.icon === "🛍️" ? slugify(categoryTitle) : meta.id;
  const groups = parseSheet(parseCsv(csv), id);
  return groups.length ? [{ id, title: meta.title, sort: 1000, groups }] : [];
}

// ─── Фото ───────────────────────────────────────────────────────────────────

const CONCURRENCY = 6;

async function copyPhoto(url: string): Promise<string | null> {
  const token = imageToken(url);
  if (!token) return url.startsWith("https://") ? url : null; // уже постоянная ссылка
  try {
    const res = await fetch(`https://docs.google.com/sheets-images-rt/${token}=s1200`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const name = `import/${token.slice(-24)}.${ext}`;
    return await uploadPhoto(name, await res.arrayBuffer(), type);
  } catch {
    return null;
  }
}

/** Копирует фото из таблицы в хранилище; возвращает «старая ссылка → новая». */
async function copyPhotos(urls: string[]): Promise<{ map: Map<string, string>; failed: number }> {
  const unique = [...new Set(urls)];
  const map = new Map<string, string>();
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      const copied = await copyPhoto(url);
      if (copied) map.set(url, copied);
      else failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return { map, failed };
}

// ─── Запись в базу ───────────────────────────────────────────────────────────

const BATCH = 500;

async function insertBatched<T>(table: string, rows: object[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(...(await insert<T>(table, rows.slice(i, i + BATCH))));
  return out;
}

export interface ImportOptions {
  /** Копировать фото из Google Таблицы в хранилище. */
  copyPhotos?: boolean;
  /**
   * "replace" — наличие и цены точки в импортируемых категориях заменяются таблицей (полный перенос).
   * "new" — добавляются только новые линейки и позиции; цены и наличие уже существующих не трогаются.
   */
  mode?: "replace" | "new";
}

export async function importCategories(
  storeId: string,
  categories: ImportCategory[],
  options: ImportOptions = {},
): Promise<ImportReport> {
  if (!getStore(storeId)) throw new Error(`Неизвестная точка: ${storeId}`);
  const onlyNew = options.mode === "new";
  const snapshot = await loadSnapshot();

  // 1. Категории (существующие не трогаем).
  const knownCategories = new Set(snapshot.categories.map((c) => c.id));
  const newCategories = categories
    .filter((c) => !knownCategories.has(c.id))
    .map<DbCategory>(({ id, title, sort }) => ({ id, title, sort }));
  if (newCategories.length) await insert("categories", newCategories, { onConflict: "id", ignoreDuplicates: true });

  // 2. План линеек: находим существующие по категории + разделу + бренду + названию.
  const linesByKey = new Map(snapshot.lines.map((l) => [lineKey(l.category_id, l), l]));
  const maxSort = new Map<string, number>();
  for (const l of snapshot.lines) maxSort.set(l.category_id, Math.max(maxSort.get(l.category_id) ?? 0, l.sort));

  const plan: { key: string; row: Omit<DbLine, "id">; group: ParsedGroup }[] = [];
  for (const category of categories) {
    const families = assignFamilies(category.groups);
    category.groups.forEach((group, index) => {
      const brand = families[index] || group.brand || null;
      const row = {
        category_id: category.id,
        brand,
        section: group.section ?? null,
        name: group.line,
        note: group.note ?? null,
        image_url: group.image ?? null, // пока исходная ссылка — заменим после копирования
        sort: (maxSort.get(category.id) ?? 0) + (index + 1) * 10,
      };
      plan.push({ key: lineKey(category.id, row), row, group });
    });
  }

  // 3. Что новое: линейки, которых нет в базе, и позиции, которых нет в своей линейке.
  const itemsByKey = new Map(snapshot.items.map((i) => [itemKey(i.line_id, i.title, i.variant), i]));
  const isNewItem = (p: (typeof plan)[number], title: string, variant: string | undefined) => {
    const line = linesByKey.get(p.key);
    return !line || !itemsByKey.has(itemKey(line.id, title, variant));
  };

  // 4. Фото копируем только для того, что будет создано: у существующих линеек и позиций фото не меняются.
  const photoUrls: string[] = [];
  if (options.copyPhotos) {
    for (const p of plan) {
      if (!linesByKey.has(p.key) && p.group.image) photoUrls.push(p.group.image);
      for (const item of p.group.items) {
        if (item.image && item.image !== p.group.image && isNewItem(p, itemTitle(item), item.variant)) photoUrls.push(item.image);
      }
    }
  }
  const photos = photoUrls.length ? await copyPhotos(photoUrls) : { map: new Map<string, string>(), failed: 0 };
  const photo = (url: string | null | undefined) => (url ? (photos.map.get(url) ?? (options.copyPhotos ? null : url)) : null);

  // 5. Новые линейки.
  const toCreate = new Map<string, Omit<DbLine, "id">>();
  for (const p of plan) if (!linesByKey.has(p.key) && !toCreate.has(p.key)) toCreate.set(p.key, { ...p.row, image_url: photo(p.row.image_url) });
  const createdLines = await insertBatched<DbLine>("product_lines", [...toCreate.values()]);
  for (const line of createdLines) linesByKey.set(lineKey(line.category_id, line), line);

  // 6. Новые позиции.
  const itemPlan: { key: string; row: Omit<DbItem, "id">; item: ProductItem }[] = [];
  for (const p of plan) {
    const line = linesByKey.get(p.key)!;
    p.group.items.forEach((item, index) => {
      const title = itemTitle(item);
      itemPlan.push({
        key: itemKey(line.id, title, item.variant),
        row: {
          line_id: line.id,
          title,
          variant: item.variant ?? null,
          image_url: item.image && item.image !== p.group.image ? photo(item.image) : null,
          sort: (index + 1) * 10,
        },
        item,
      });
    });
  }
  const itemsToCreate = new Map<string, Omit<DbItem, "id">>();
  for (const p of itemPlan) if (!itemsByKey.has(p.key) && !itemsToCreate.has(p.key)) itemsToCreate.set(p.key, p.row);
  const createdItems = await insertBatched<DbItem>("items", [...itemsToCreate.values()]);
  for (const item of createdItems) itemsByKey.set(itemKey(item.line_id, item.title, item.variant), item);

  // 7. Наличие и цены точки.
  const stockRows = new Map<string, DbStock>();
  for (const p of itemPlan) {
    const item = itemsByKey.get(p.key)!;
    stockRows.set(item.id, {
      item_id: item.id,
      store_id: storeId,
      price: p.item.price,
      old_price: p.item.oldPrice ?? null,
      in_stock: p.item.status !== "out",
    });
  }

  let addedToStore = 0;
  if (onlyNew) {
    // Только то, чего в этой точке ещё нет; существующие цены и наличие остаются как в админке.
    const present = new Set(snapshot.stock.filter((s) => s.store_id === storeId).map((s) => s.item_id));
    const missing = [...stockRows.values()].filter((row) => !present.has(row.item_id));
    await insertBatched("item_stock", missing);
    addedToStore = missing.length;
    // Новые вкусы — на свои места по алфавиту, как при добавлении из админки.
    const touched = [...new Set(createdItems.map((item) => item.line_id))];
    if (touched.length) await sortLines(touched);
  } else {
    // Заменяем наличие точки в импортируемых категориях целиком (другие категории не трогаем).
    const importedCategories = new Set(categories.map((c) => c.id));
    const lineCategory = new Map(snapshot.lines.map((l) => [l.id, l.category_id]));
    const itemCategory = new Map(snapshot.items.map((i) => [i.id, lineCategory.get(i.line_id)]));
    const existingIds = snapshot.stock
      .filter((s) => s.store_id === storeId && importedCategories.has(itemCategory.get(s.item_id) ?? ""))
      .map((s) => s.item_id);
    for (let i = 0; i < existingIds.length; i += 150) {
      await remove("item_stock", { store_id: `eq.${storeId}`, item_id: inList(existingIds.slice(i, i + 150)) });
    }
    await insertBatched("item_stock", [...stockRows.values()]);
    addedToStore = stockRows.size;
  }

  return {
    storeId,
    mode: onlyNew ? "new" : "replace",
    categories: categories.length,
    lines: { total: plan.length, created: createdLines.length },
    items: { total: itemPlan.length, created: createdItems.length, addedToStore },
    photos: { copied: photos.map.size, failed: photos.failed },
  };
}

/** Импорт точки прямо из её Google Таблицы (данные + фото). */
export async function importStoreFromSheets(storeId: string, mode: ImportOptions["mode"] = "replace"): Promise<ImportReport> {
  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);
  const { sheets } = await fetchStoreSheets(store);
  return importCategories(storeId, categoriesFromSheets(sheets), { copyPhotos: true, mode });
}

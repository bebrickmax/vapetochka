import { cacheLife, cacheTag } from "next/cache";
import { cacheConfig, sheetsConfig } from "@/config/site";
import { getStore, type Store } from "@/config/stores";
import { demoSheets, demoWholesaleSheet } from "@/data/demo-sheets";
import { assignFamilies } from "@/lib/brands";
import { proxyImages } from "@/lib/photos";
import { uniqueKeys } from "@/lib/products";
import { categoryFromSheet } from "@/lib/sheets/categories";
import { parseSheet } from "@/lib/sheets/parse";
import { catalogFromSnapshot, loadSnapshot } from "@/lib/db/catalog";
import { cleanupOverrides, loadOverrides, loadStoreSources } from "@/lib/db/overrides";
import { isDbConfigured } from "@/lib/db/supabase";
import { applyOverrides } from "@/lib/overrides";
import { fetchStoreSheets, fetchWholesaleSheet, type StoreSheets } from "@/lib/sheets/sources";
import { parseWholesaleSheet } from "@/lib/sheets/wholesale";
import type { Catalog, CatalogSource, Category, ProductGroup, RawSheet, Wholesale } from "@/lib/types";

/** Превращает сырые листы в каталог: категории (в порядке листов) + линейки товаров. */
export function buildCatalog(sheets: RawSheet[], source: CatalogSource, storeId = "main"): Catalog {
  const categories: Category[] = [];
  const groups: ProductGroup[] = [];
  const usedIds = new Set<string>();

  for (const sheet of sheets) {
    const category = categoryFromSheet(sheet.title);
    if (usedIds.has(category.id)) category.id = `${category.id}-${usedIds.size}`;
    const parsed = parseSheet(sheet.rows, category.id, proxyImages(storeId, sheet.gid, sheet.images));
    if (parsed.length === 0) continue; // пустые листы не показываем
    usedIds.add(category.id);
    categories.push(category);

    const families = assignFamilies(parsed);
    // id линейки — по её названию, а не по номеру: правки таблицы выше не сдвигают корзину.
    const keys = uniqueKeys(parsed.map((g) => `${g.section ?? ""}|${g.brand ?? ""}|${g.line}`));
    parsed.forEach((group, index) => {
      groups.push({ ...group, id: `${category.id}-${keys[index]}`, family: families[index] });
    });
  }

  return { storeId, categories, groups, updatedAt: new Date().toISOString(), source };
}

/** Лист «ОПТ» → оптовые цены по ступеням; если он не похож на прайс — просто строки текста. */
export function buildWholesale(sheet: RawSheet, storeId = "main"): Wholesale | undefined {
  return parseWholesaleSheet(sheet.rows, proxyImages(storeId, sheet.gid, sheet.images));
}

async function loadSheets(store: Store): Promise<StoreSheets & { source: CatalogSource }> {
  const demo = { sheets: demoSheets, wholesale: demoWholesaleSheet, source: "demo" as const };
  if (process.env.CATALOG_SOURCE === "demo") return demo;

  try {
    const data = await fetchStoreSheets(store);
    return { ...data, source: sheetsConfig.apiKey ? "api" : "csv" };
  } catch (error) {
    // В продакшене падаем: Next.js продолжит показывать последнюю удачную версию.
    if (process.env.NODE_ENV === "production") throw error;
    console.warn(`[catalog] Таблица «${store.title}» недоступна, показываю демо-данные:`, error);
    return demo;
  }
}

async function loadDbCatalog(store: Store): Promise<Catalog | null> {
  if (!isDbConfigured() || process.env.CATALOG_SOURCE === "demo") return null;
  const catalog = catalogFromSnapshot(await loadSnapshot(), store.id);
  if (catalog.groups.length === 0) return null; // база ещё не заполнена — работаем от таблиц
  // Оптовые цены пока остаются в листе «ОПТ» Google Таблицы.
  const wholesaleSheet = await fetchWholesaleSheet(store);
  const wholesale = wholesaleSheet ? buildWholesale(wholesaleSheet, store.id) : undefined;
  return wholesale ? { ...catalog, wholesale } : catalog;
}

const cacheProfile = {
  stale: cacheConfig.revalidateSeconds,
  revalidate: cacheConfig.revalidateSeconds,
  expire: 60 * 60 * 24 * 7,
};

/**
 * Каталог точки ровно как в Google Таблице (без правок из админки). Кэшируется
 * отдельно: правка наличия в админке не заставляет заново скачивать таблицу.
 */
export async function getSheetCatalog(storeId: string): Promise<Catalog> {
  "use cache";
  cacheTag(cacheConfig.sheetsTag);
  cacheLife(cacheProfile);

  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);
  const { sheets, wholesale: wholesaleSheet, source } = await loadSheets(store);
  const catalog = buildCatalog(sheets, source, store.id);
  const wholesale = wholesaleSheet ? buildWholesale(wholesaleSheet, store.id) : undefined;
  return wholesale ? { ...catalog, wholesale } : catalog;
}

/** Таблица + быстрые правки из админки. Ошибка базы не ломает витрину — тогда просто таблица. */
async function withOverrides(catalog: Catalog): Promise<Catalog> {
  try {
    const overrides = await loadOverrides(catalog.storeId);
    if (!overrides?.length) return catalog;
    const { groups, cleanup } = applyOverrides(catalog.groups, overrides);
    if (cleanup.remove.length || cleanup.update.length) {
      await cleanupOverrides(catalog.storeId, cleanup).catch((e) => console.error("[catalog] Не удалось убрать устаревшие правки:", e));
    }
    return { ...catalog, groups };
  } catch (error) {
    console.error("[catalog] Правки из админки недоступны, показываю таблицу:", error);
    return catalog;
  }
}

/**
 * Каталог точки с кэшем: страница отдаётся мгновенно из кэша, а раз в
 * `revalidateSeconds` данные перечитываются в фоне. Любое изменение в админке
 * (и /api/revalidate) сбрасывает кэш сразу — следующий запрос получит свежие данные.
 *
 * Откуда берутся товары, решает настройка точки в админке:
 *   «таблица» — Google Таблица + быстрые правки наличия и цен из админки;
 *   «админка» — только база.
 */
export async function getCatalog(storeId: string): Promise<Catalog> {
  "use cache";
  cacheTag(cacheConfig.tag);
  cacheLife(cacheProfile);

  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);
  if (!isDbConfigured() || process.env.CATALOG_SOURCE === "demo") return getSheetCatalog(store.id);

  const sources = await loadStoreSources();
  if (sources === null) {
    // База без таблицы настроек (schema.sql ещё не обновлён) — как раньше: база, если в ней есть товары точки.
    return (await loadDbCatalog(store)) ?? getSheetCatalog(store.id);
  }
  if (sources[store.id] === "db") {
    const fromDb = await loadDbCatalog(store);
    if (fromDb) return fromDb;
  }
  return withOverrides(await getSheetCatalog(store.id));
}

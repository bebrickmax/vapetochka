import { cacheLife, cacheTag } from "next/cache";
import { cacheConfig, sheetsConfig } from "@/config/site";
import { getStore, type Store } from "@/config/stores";
import { demoSheets, demoWholesaleSheet } from "@/data/demo-sheets";
import { assignFamilies } from "@/lib/brands";
import { proxyImages } from "@/lib/photos";
import { categoryFromSheet } from "@/lib/sheets/categories";
import { parseSheet } from "@/lib/sheets/parse";
import { fetchStoreSheets, type StoreSheets } from "@/lib/sheets/sources";
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
    parsed.forEach((group, index) => {
      groups.push({ ...group, id: `${category.id}-${index}`, family: families[index] });
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

/**
 * Каталог точки с кэшем: страница отдаётся мгновенно из кэша, а раз в
 * `revalidateSeconds` таблица перечитывается в фоне. Кнопка/скрипт
 * /api/revalidate сбрасывает кэш сразу.
 */
export async function getCatalog(storeId: string): Promise<Catalog> {
  "use cache";
  cacheTag(cacheConfig.tag);
  cacheLife({
    stale: cacheConfig.revalidateSeconds,
    revalidate: cacheConfig.revalidateSeconds,
    expire: 60 * 60 * 24 * 7,
  });

  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);

  const { sheets, wholesale: wholesaleSheet, source } = await loadSheets(store);
  const catalog = buildCatalog(sheets, source, store.id);
  const wholesale = wholesaleSheet ? buildWholesale(wholesaleSheet, store.id) : undefined;
  return wholesale ? { ...catalog, wholesale } : catalog;
}

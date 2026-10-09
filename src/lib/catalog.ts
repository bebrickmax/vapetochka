import { cacheLife, cacheTag } from "next/cache";
import { cacheConfig, sheetsConfig } from "@/config/site";
import { demoSheets } from "@/data/demo-sheets";
import { categoryFromSheet } from "@/lib/sheets/categories";
import { parseSheet } from "@/lib/sheets/parse";
import { fetchViaApi, fetchViaCsv } from "@/lib/sheets/sources";
import type { Catalog, CatalogSource, Category, ProductGroup, RawSheet } from "@/lib/types";

/** Превращает сырые листы в каталог: категории (в порядке листов) + группы товаров. */
export function buildCatalog(sheets: RawSheet[], source: CatalogSource): Catalog {
  const categories: Category[] = [];
  const groups: ProductGroup[] = [];
  const usedIds = new Set<string>();

  for (const sheet of sheets) {
    const category = categoryFromSheet(sheet.title);
    if (usedIds.has(category.id)) category.id = `${category.id}-${usedIds.size}`;
    const parsed = parseSheet(sheet.rows, category.id);
    if (parsed.length === 0) continue; // пустые листы не показываем
    usedIds.add(category.id);
    categories.push(category);
    groups.push(...parsed);
  }

  return { categories, groups, updatedAt: new Date().toISOString(), source };
}

async function loadSheets(): Promise<{ sheets: RawSheet[]; source: CatalogSource }> {
  if (process.env.CATALOG_SOURCE === "demo") return { sheets: demoSheets, source: "demo" };

  try {
    if (sheetsConfig.apiKey) return { sheets: await fetchViaApi(), source: "api" };
    return { sheets: await fetchViaCsv(), source: "csv" };
  } catch (error) {
    // В продакшене падаем: Next.js продолжит показывать последнюю удачную версию.
    if (process.env.NODE_ENV === "production") throw error;
    console.warn("[catalog] Google Таблица недоступна, показываю демо-данные:", error);
    return { sheets: demoSheets, source: "demo" };
  }
}

/**
 * Каталог с кэшем (ISR): страница отдаётся мгновенно из кэша, а раз в
 * `revalidateSeconds` таблица перечитывается в фоне. Кнопка/скрипт
 * /api/revalidate сбрасывает кэш сразу.
 */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag(cacheConfig.tag);
  cacheLife({
    stale: cacheConfig.revalidateSeconds,
    revalidate: cacheConfig.revalidateSeconds,
    expire: 60 * 60 * 24 * 7,
  });

  const { sheets, source } = await loadSheets();
  return buildCatalog(sheets, source);
}

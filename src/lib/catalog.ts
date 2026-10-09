import { cacheLife, cacheTag } from "next/cache";
import { cacheConfig, sheetsConfig } from "@/config/site";
import { demoSheets, demoWholesaleSheet } from "@/data/demo-sheets";
import { categoryFromSheet } from "@/lib/sheets/categories";
import { parseSheet } from "@/lib/sheets/parse";
import { fetchSheetByTitle, fetchViaApi, fetchViaCsv } from "@/lib/sheets/sources";
import type { Catalog, CatalogSource, Category, ProductGroup, RawSheet, Wholesale } from "@/lib/types";

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

/** Лист «ОПТ» → оптовые позиции; если он не похож на прайс — просто строки текста. */
export function buildWholesale(sheet: RawSheet): Wholesale | undefined {
  const groups = parseSheet(sheet.rows, "wholesale");
  const lines = groups.length
    ? []
    : sheet.rows
        .map((row) =>
          row
            .map((c) => String(c ?? "").trim())
            .filter(Boolean)
            .join(" · "),
        )
        .filter(Boolean);
  return groups.length || lines.length ? { groups, lines } : undefined;
}

async function loadWholesale(source: CatalogSource): Promise<Wholesale | undefined> {
  const title = sheetsConfig.wholesaleSheet.trim();
  if (!title) return undefined;
  if (source === "demo") return buildWholesale(demoWholesaleSheet);
  try {
    return buildWholesale(await fetchSheetByTitle(title));
  } catch (error) {
    // Раздел ОПТ необязательный: без него каталог всё равно должен работать.
    console.warn(`[catalog] Лист «${title}» недоступен:`, error);
    return undefined;
  }
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
  const catalog = buildCatalog(sheets, source);
  const wholesale = await loadWholesale(source);
  return wholesale ? { ...catalog, wholesale } : catalog;
}

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
import { cleanupOverrides, loadOverrides } from "@/lib/db/overrides";
import { loadSettings, sourceOf, syncStore, type SyncResult } from "@/lib/db/sync";
import type { DbSnapshot } from "@/lib/db/types";
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

/**
 * Оптовые цены (лист «ОПТ» живёт в Google Таблице) — со своим кэшем: если Google временно
 * не отвечает, ошибка не кэшируется и витрина показывает прошлый ОПТ, а не пустой раздел.
 */
async function cachedWholesale(storeId: string): Promise<Wholesale | null> {
  "use cache";
  cacheTag(cacheConfig.wholesaleTag);
  cacheLife({ stale: 60, revalidate: 300, expire: 60 * 60 * 24 * 30 });
  const store = getStore(storeId);
  if (!store || process.env.CATALOG_SOURCE === "demo") return null;
  const sheet = await fetchWholesaleSheet(store);
  return (sheet && buildWholesale(sheet, store.id)) ?? null;
}

/** ОПТ: свежий лист, если он уже скачан, иначе — из кэша (при сбое Google — прошлый). */
async function wholesaleFor(storeId: string, sheet: RawSheet | undefined): Promise<Wholesale | undefined> {
  const fresh = sheet ? buildWholesale(sheet, storeId) : undefined;
  if (fresh) return fresh;
  return (await cachedWholesale(storeId).catch(() => null)) ?? undefined;
}

/**
 * Каталог точки из базы. snapshot — уже загруженный снимок, wholesale — уже скачанный лист «ОПТ»
 * (оптовые цены пока живут в Google Таблице).
 */
async function loadDbCatalog(
  store: Store,
  ready: { snapshot?: DbSnapshot | null; wholesale?: { sheet?: RawSheet } } = {},
): Promise<Catalog | null> {
  if (!isDbConfigured() || process.env.CATALOG_SOURCE === "demo") return null;
  const catalog = catalogFromSnapshot(ready.snapshot ?? (await loadSnapshot()), store.id);
  if (catalog.groups.length === 0) return null; // база ещё не заполнена — работаем от таблиц
  const wholesale = await wholesaleFor(store.id, ready.wholesale?.sheet);
  return wholesale ? { ...catalog, wholesale } : catalog;
}

/**
 * Ошибка, после которой витрина остаётся на последней удачной версии.
 *
 * Страницы точек собираются заранее (generateStaticParams) и лежат в кэше Vercel (ISR) — он общий для всех
 * серверов и переживает холодный старт. Если пересборка в фоне падает, Next.js не заменяет страницу и
 * повторяет попытку при следующем запросе; при деплое падает сборка — и остаётся прошлый деплой.
 */
class KeepLastVersion extends Error {}

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
  const wholesale = source === "demo" ? wholesaleSheet && buildWholesale(wholesaleSheet, store.id) : await wholesaleFor(store.id, wholesaleSheet);
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
 *   «от таблицы» — база как зеркало Google Таблицы: перед показом подтягиваются изменения
 *                  таблицы (не чаще раза в 20 секунд), а правки и новинки из админки сохраняются;
 *   «от админки» — только база, таблица не влияет.
 * База ещё не настроена или точка в ней пустая (до первой синхронизации) — показываем саму таблицу.
 *
 * База не отвечает — ошибка (KeepLastVersion): витрина остаётся на последней удачной версии, а не
 * откатывается на таблицу. В режиме «от админки» таблица устарела, а в режиме «от таблицы» в ней нет
 * вкусов и правок, добавленных в админке, — в обоих случаях прошлая витрина честнее.
 */
export async function getCatalog(storeId: string): Promise<Catalog> {
  "use cache";
  cacheTag(cacheConfig.tag);
  cacheLife(cacheProfile);

  const store = getStore(storeId);
  if (!store) throw new Error(`Неизвестная точка: ${storeId}`);
  if (!isDbConfigured() || process.env.CATALOG_SOURCE === "demo") return getSheetCatalog(store.id);

  const keepLast = (what: string) => (error: unknown) => {
    console.error(`[catalog] «${store.title}»: ${what} — оставляю прошлую витрину:`, error);
    throw new KeepLastVersion(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  };
  const settings = await loadSettings().catch(keepLast("настройки точек не прочитались"));
  const source = sourceOf(settings, store.id);

  if (source === "db") {
    const catalog = await loadDbCatalog(store).catch(keepLast("база не отвечает"));
    // Перейти на админку можно только с товарами в базе, так что пустая точка здесь — сбой, а не пустой магазин.
    if (!catalog) throw new KeepLastVersion(`«${store.title}» от админки, но в базе нет её товаров`);
    return catalog;
  }
  // Старая схема без настроек точек — база, если в ней есть товары точки, иначе таблица.
  if (settings === null) return (await loadDbCatalog(store).catch(keepLast("база не отвечает"))) ?? getSheetCatalog(store.id);
  // Схема без колонок зеркала — таблица + быстрые правки.
  if (!settings.mirror) return withOverrides(await getSheetCatalog(store.id));

  let synced: SyncResult | null = null;
  try {
    synced = await syncStore(store.id, { minIntervalSeconds: 20, maxPhotos: 8 });
  } catch (error) {
    console.error(`[catalog] Синхронизация «${store.title}» не удалась, показываю последнюю:`, error);
  }
  const fromDb = await loadDbCatalog(store, {
    snapshot: synced?.snapshot,
    ...(synced && { wholesale: { sheet: synced.sheets.wholesale } }),
  }).catch(keepLast("база не отвечает"));
  // Точка ещё ни разу не синхронизировалась (пустая база) — показываем таблицу как есть.
  return fromDb ?? withOverrides(await getSheetCatalog(store.id));
}

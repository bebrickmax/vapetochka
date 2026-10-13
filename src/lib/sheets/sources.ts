import { sheetsConfig } from "@/config/site";
import type { Store } from "@/config/stores";
import type { RawSheet } from "@/lib/types";
import { parseCsv } from "./csv";
import { parseSheetImages, parseTabList, type SheetTab } from "./htmlview";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DOCS_BASE = "https://docs.google.com/spreadsheets/d";

interface SheetProperties {
  title: string;
  sheetId: number;
  index: number;
  hidden?: boolean;
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const isExcluded = (title: string) => sheetsConfig.excludedSheets.some((name) => sameTitle(name, title));

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function getText(url: string, what: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Не удалось скачать ${what} (${res.status}). Проверьте, что таблица открыта по ссылке.`);
  return text;
}

/**
 * Все листы таблицы по порядку (название + gid).
 * С ключом — через API (скрытые листы пропускаются), без ключа — из
 * веб-просмотра таблицы, а если он не ответил — из запасного списка точки.
 */
export async function listTabs(store: Store): Promise<SheetTab[]> {
  const { apiKey } = sheetsConfig;
  if (apiKey) {
    const meta = await getJson<{ sheets: { properties: SheetProperties }[] }>(
      `${API_BASE}/${store.spreadsheetId}?key=${encodeURIComponent(apiKey)}&fields=sheets.properties(title,sheetId,index,hidden)`,
    );
    return meta.sheets
      .map((s) => s.properties)
      .filter((p) => !p.hidden)
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ title: p.title, gid: String(p.sheetId) }));
  }
  try {
    const html = await getText(`${DOCS_BASE}/${store.spreadsheetId}/htmlview`, "список листов");
    const tabs = parseTabList(html);
    if (tabs.length > 0) return tabs;
  } catch (error) {
    console.warn(`[catalog] Список листов «${store.title}» не прочитан, беру запасной:`, error);
  }
  return [...store.fallbackTabs];
}

/** Содержимое листов (значения ячеек). */
async function fetchRows(store: Store, tabs: SheetTab[]): Promise<string[][][]> {
  const { apiKey, columns } = sheetsConfig;
  if (tabs.length === 0) return [];
  if (apiKey) {
    const ranges = tabs
      .map((t) => `ranges=${encodeURIComponent(`'${t.title.replace(/'/g, "''")}'!${columns}`)}`)
      .join("&");
    const data = await getJson<{ valueRanges: { values?: string[][] }[] }>(
      `${API_BASE}/${store.spreadsheetId}/values:batchGet?key=${encodeURIComponent(apiKey)}&majorDimension=ROWS&${ranges}`,
    );
    return tabs.map((_, i) => data.valueRanges[i]?.values ?? []);
  }
  return Promise.all(
    tabs.map(async (tab) => {
      const text = await getText(
        `${DOCS_BASE}/${store.spreadsheetId}/export?format=csv&gid=${tab.gid}`,
        `лист «${tab.title}»`,
      );
      if (text.trimStart().startsWith("<")) {
        throw new Error(`Лист «${tab.title}» не отдался как CSV. Проверьте, что таблица открыта по ссылке.`);
      }
      return parseCsv(text);
    }),
  );
}

/**
 * Фото, вставленные в ячейки колонки A (номер строки → адрес картинки).
 * Необязательная часть: если не получилось — каталог работает без фото.
 */
export async function fetchSheetImages(store: Store, gid: string): Promise<Record<number, string>> {
  try {
    const html = await getText(`${DOCS_BASE}/${store.spreadsheetId}/htmlview/sheet?headers=true&gid=${gid}`, "фото");
    return parseSheetImages(html);
  } catch (error) {
    console.warn(`[catalog] Фото листа ${gid} («${store.title}») не загрузились:`, error);
    return {};
  }
}

async function withImages(store: Store, tab: SheetTab, rows: string[][]): Promise<RawSheet> {
  return { title: tab.title, gid: tab.gid, rows, images: await fetchSheetImages(store, tab.gid) };
}

export interface StoreSheets {
  /** Листы каталога (без исключённых и без листа ОПТ). */
  sheets: RawSheet[];
  /** Лист оптовых цен, если он есть. */
  wholesale?: RawSheet;
}

async function loadWholesaleTab(store: Store, tab: SheetTab | undefined): Promise<RawSheet | undefined> {
  if (!tab) return undefined;
  try {
    const [rows] = await fetchRows(store, [tab]);
    return await withImages(store, tab, rows);
  } catch (error) {
    // Раздел ОПТ необязательный: без него каталог всё равно должен работать.
    console.warn(`[catalog] Лист «${tab.title}» («${store.title}») недоступен:`, error);
    return undefined;
  }
}

const findWholesaleTab = (tabs: SheetTab[]) => {
  const title = sheetsConfig.wholesaleSheet.trim();
  return title ? tabs.find((t) => sameTitle(t.title, title)) : undefined;
};

/** Только лист «ОПТ» (когда каталог уже берётся из базы). Ошибки не пробрасывает. */
export async function fetchWholesaleSheet(store: Store): Promise<RawSheet | undefined> {
  try {
    return await loadWholesaleTab(store, findWholesaleTab(await listTabs(store)));
  } catch (error) {
    console.warn(`[catalog] ОПТ «${store.title}» недоступен:`, error);
    return undefined;
  }
}

/** Все данные таблицы точки: листы каталога с фото и лист «ОПТ». */
export async function fetchStoreSheets(store: Store): Promise<StoreSheets> {
  const tabs = await listTabs(store);
  const wholesaleTab = findWholesaleTab(tabs);
  const catalogTabs = tabs.filter((t) => !isExcluded(t.title) && t !== wholesaleTab);

  const [rows, wholesale] = await Promise.all([fetchRows(store, catalogTabs), loadWholesaleTab(store, wholesaleTab)]);
  const sheets = await Promise.all(catalogTabs.map((tab, i) => withImages(store, tab, rows[i])));
  return { sheets, ...(wholesale && { wholesale }) };
}

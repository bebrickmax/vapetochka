import { sheetsConfig } from "@/config/site";
import type { RawSheet } from "@/lib/types";
import { parseCsv } from "./csv";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

interface SheetProperties {
  title: string;
  sheetId: number;
  index: number;
  hidden?: boolean;
}

const isExcluded = (title: string) =>
  sheetsConfig.excludedSheets.some((name) => name.toLowerCase() === title.trim().toLowerCase());

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Режим с API-ключом: сам находит все видимые листы и забирает их
 * одним запросом batchGet. Таблица должна быть доступна «всем, у кого есть ссылка».
 */
export async function fetchViaApi(): Promise<RawSheet[]> {
  const { spreadsheetId, apiKey, columns } = sheetsConfig;
  const key = encodeURIComponent(apiKey);

  const meta = await getJson<{ sheets: { properties: SheetProperties }[] }>(
    `${API_BASE}/${spreadsheetId}?key=${key}&fields=sheets.properties(title,sheetId,index,hidden)`,
  );
  const visible = meta.sheets
    .map((s) => s.properties)
    .filter((p) => !p.hidden && !isExcluded(p.title))
    .sort((a, b) => a.index - b.index);
  if (visible.length === 0) return [];

  const ranges = visible
    .map((p) => `ranges=${encodeURIComponent(`'${p.title.replace(/'/g, "''")}'!${columns}`)}`)
    .join("&");
  const data = await getJson<{ valueRanges: { values?: string[][] }[] }>(
    `${API_BASE}/${spreadsheetId}/values:batchGet?key=${key}&majorDimension=ROWS&${ranges}`,
  );

  return visible.map((p, i) => ({ title: p.title, rows: data.valueRanges[i]?.values ?? [] }));
}

/**
 * Режим без ключа: скачивает каждый лист как CSV.
 * Таблица должна быть доступна «всем, у кого есть ссылка».
 */
export async function fetchViaCsv(): Promise<RawSheet[]> {
  const { spreadsheetId, csvTabs } = sheetsConfig;
  const tabs = csvTabs.filter((t) => !isExcluded(t.title));

  return Promise.all(
    tabs.map(async (tab) => {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${tab.gid}`;
      const res = await fetch(url, { redirect: "follow" });
      const text = await res.text();
      if (!res.ok || text.trimStart().startsWith("<")) {
        throw new Error(
          `Не удалось скачать лист «${tab.title}» (${res.status}). Проверьте, что таблица открыта по ссылке.`,
        );
      }
      return { title: tab.title, rows: parseCsv(text) };
    }),
  );
}

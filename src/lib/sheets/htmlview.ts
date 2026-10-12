/*
 * Разбор «веб-просмотра» Google Таблицы (docs.google.com/…/htmlview).
 * Он доступен без API-ключа, если таблица открыта по ссылке, и даёт то,
 * чего нет в CSV-выгрузке: список листов и картинки, вставленные в ячейки.
 */

export interface SheetTab {
  title: string;
  gid: string;
}

/** Раскрывает экранирование JS-строки: \x27, &, \/, \\, \". */
function decodeJsString(value: string): string {
  return value.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, esc: string) => {
    if (esc[0] === "x" || esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc === "n") return "\n";
    if (esc === "t") return "\t";
    return esc;
  });
}

/** Список листов из страницы htmlview: `items.push({name: "…", …, gid: "…"})`. */
export function parseTabList(html: string): SheetTab[] {
  const tabs: SheetTab[] = [];
  const seen = new Set<string>();
  const re = /\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(-?\d+)"/g;
  for (const match of html.matchAll(re)) {
    const gid = match[2];
    if (seen.has(gid)) continue;
    seen.add(gid);
    tabs.push({ title: decodeJsString(match[1]), gid });
  }
  return tabs;
}

/** Базовый адрес картинки без параметров размера (=w149-h41). */
export function imageBaseUrl(src: string): string {
  return src.replace(/&amp;/g, "&").replace(/=[swh]\d+(?:-[swh]\d+)*$/, "");
}

/** Адрес картинки нужного размера: Google сам уменьшает её по длинной стороне. */
export function sizedImage(url: string, size: number): string {
  return `${url}=s${size}`;
}

const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const ROW_ID_RE = /<th\b[^>]*\bid="-?\d+R(\d+)"/;
const CELL_RE = /<td\b([^>]*)>([\s\S]*?)<\/td>/g;
const IMG_RE = /<img\b[^>]*\bsrc="(https:\/\/[^"]*sheets-images-rt\/[^"]+)"/;

const spanOf = (attrs: string, name: string) => {
  const match = attrs.match(new RegExp(`\\b${name}="(\\d+)"`));
  return match ? Math.max(1, Number(match[1])) : 1;
};

/**
 * Картинки в ячейках листа (страница htmlview/sheet?headers=true&gid=…):
 * номер строки (с 0, как в CSV) → базовый адрес картинки.
 * Учитывает объединённые ячейки, чтобы точно определить колонку.
 */
export function parseSheetImages(html: string, column = 0): Record<number, string> {
  const images: Record<number, string> = {};
  // Сколько ещё строк каждая колонка занята объединённой ячейкой сверху.
  const busy: number[] = [];

  for (const rowMatch of html.matchAll(ROW_RE)) {
    const rowHtml = rowMatch[1];
    const idMatch = rowHtml.match(ROW_ID_RE);
    if (!idMatch) continue; // шапка с буквами колонок, служебные строки
    const row = Number(idMatch[1]);

    let col = 0;
    const take = () => {
      while ((busy[col] ?? 0) > 0) col++;
    };
    for (const cell of rowHtml.matchAll(CELL_RE)) {
      const [, attrs, content] = cell;
      if (/freezebar/.test(attrs)) continue;
      take();
      const colspan = spanOf(attrs, "colspan");
      const rowspan = spanOf(attrs, "rowspan");
      if (col <= column && column < col + colspan) {
        const img = content.match(IMG_RE);
        if (img && images[row] === undefined) images[row] = imageBaseUrl(img[1]);
      }
      if (rowspan > 1) for (let c = col; c < col + colspan; c++) busy[c] = rowspan;
      col += colspan;
    }
    // Строка закончилась: объединения сверху сдвигаются на одну строку вниз.
    for (let c = 0; c < busy.length; c++) if (busy[c] > 0) busy[c]--;
  }
  return images;
}

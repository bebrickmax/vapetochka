import { createHash } from "node:crypto";

/*
 * «Версия» Google Таблицы точки — короткий отпечаток значений всех листов.
 *
 * Автообновление (/api/revalidate) сравнивает версию свежей таблицы с версией, из которой собрана
 * витрина (или с которой в последний раз синхронизировалась база): совпали — ничего не делаем,
 * не качаем фото, не трогаем базу и не пересобираем страницы. Так проверка раз в несколько минут
 * почти ничего не стоит, а правки по-прежнему доходят сразу.
 *
 * Фото в версию не входят: ссылки Google на картинки со временем меняются сами, без правок таблицы.
 */

interface VersionSheet {
  title: string;
  gid?: string;
  rows: string[][];
}

interface VersionSource {
  sheets: VersionSheet[];
  wholesale?: VersionSheet;
  partial?: boolean;
}

const sheetKey = (sheet: VersionSheet) => [sheet.title, sheet.gid ?? "", sheet.rows];

export function sheetsVersion(data: VersionSource): string {
  const payload = JSON.stringify([
    data.partial ? 1 : 0,
    data.sheets.map(sheetKey),
    data.wholesale ? sheetKey(data.wholesale) : null,
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

/** <meta name="…" content="версия"> на странице точки — версия таблицы, из которой страница собрана. */
export const CATALOG_VERSION_META = "vt-catalog-version";

/** Версия из HTML страницы точки (null — её там нет: страница из базы или собрана старым кодом). */
export function versionFromHtml(html: string): string | null {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\bname="${CATALOG_VERSION_META}"[^>]*>`))?.[0];
  return tag?.match(/\bcontent="([0-9a-f]{8,64})"/)?.[1] ?? null;
}

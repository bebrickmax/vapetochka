import { AdminError, adminRoute, json, readJson } from "@/lib/admin/api";
import { storeInfos } from "@/config/stores";
import { describeSync, syncNow } from "@/lib/admin/sheet-mutations";
import { categoryFromCsv, importCategories, importStoreFromSheets, type ImportReport } from "@/lib/db/import";
import { loadSettings } from "@/lib/db/sync";

/** Импорт копирует сотни фото — даём функции до 5 минут. */
export const maxDuration = 300;

interface ImportBody {
  source: "sheets" | "csv";
  storeId: string;
  /** Для CSV: название категории (листа) и содержимое файла. */
  category?: string;
  csv?: string;
  /** "replace" — заменить цены и наличие точки таблицей; "new" — только добавить новые товары. */
  mode?: "replace" | "new";
}

/**
 * Импорт ассортимента в базу:
 *   { source: "sheets", storeId }                       — из Google Таблицы точки (с фото);
 *   { source: "csv", storeId, category, csv }           — из CSV одного листа.
 * mode: "new" — только новые линейки и вкусы, существующие цены и наличие не трогаются.
 */
export const POST = adminRoute(async (request) => {
  const body = await readJson<ImportBody>(request);
  const mode = body.mode === "new" ? "new" : "replace";
  const title = storeInfos.find((s) => s.id === body.storeId)?.title ?? body.storeId;

  if (body.source === "sheets") {
    // Обычный путь — синхронизация (те же ключи, что у зеркала таблицы).
    if ((await loadSettings())?.mirror) return json({ text: describeSync(title, await syncNow(body.storeId, mode)) });
    return json({ text: describeImport(title, await importStoreFromSheets(body.storeId, mode)) });
  }
  if (body.source === "csv") {
    if (!body.category?.trim() || !body.csv?.trim()) throw new AdminError("Укажите категорию и файл CSV");
    if (body.csv.length > 3_000_000) throw new AdminError("Файл слишком большой");
    const categories = categoryFromCsv(body.category, body.csv);
    if (categories.length === 0) throw new AdminError("В файле не нашлось ни одной линейки с товарами");
    return json({ text: describeImport(title, await importCategories(body.storeId, categories, { mode })) });
  }
  throw new AdminError("Неизвестный источник импорта");
});

function describeImport(title: string, r: ImportReport): string {
  if (r.mode === "new") {
    if (r.lines.created === 0 && r.items.addedToStore === 0) return `«${title}»: новых товаров нет`;
    return `«${title}»: добавлено позиций: ${r.items.addedToStore}${r.lines.created ? `, новых линеек: ${r.lines.created}` : ""}`;
  }
  return `«${title}»: ${r.lines.total} линеек, ${r.items.total} позиций${r.photos.copied ? `, фото: ${r.photos.copied}` : ""}`;
}

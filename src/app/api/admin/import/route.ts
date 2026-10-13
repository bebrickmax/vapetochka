import { AdminError, adminRoute, json, readJson } from "@/lib/admin/api";
import { categoryFromCsv, importCategories, importStoreFromSheets } from "@/lib/db/import";

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
  if (body.source === "sheets") return json(await importStoreFromSheets(body.storeId, mode));
  if (body.source === "csv") {
    if (!body.category?.trim() || !body.csv?.trim()) throw new AdminError("Укажите категорию и файл CSV");
    if (body.csv.length > 3_000_000) throw new AdminError("Файл слишком большой");
    const categories = categoryFromCsv(body.category, body.csv);
    if (categories.length === 0) throw new AdminError("В файле не нашлось ни одной линейки с товарами");
    return json(await importCategories(body.storeId, categories, { mode }));
  }
  throw new AdminError("Неизвестный источник импорта");
});

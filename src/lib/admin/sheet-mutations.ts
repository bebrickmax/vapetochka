import { getStore } from "@/config/stores";
import { selectAll } from "@/lib/db/supabase";
import { loadSettings, setStoreSource, sourceOf, syncStore, type StoreSource, type SyncReport } from "@/lib/db/sync";
import { AdminError } from "./api";

/*
 * Режим точки и синхронизация с Google Таблицей из админки.
 */

export const SCHEMA_HINT = "Обновите базу: в Supabase → SQL Editor выполните supabase/schema.sql ещё раз.";

function storeId(value: unknown): string {
  if (typeof value !== "string" || !getStore(value)) throw new AdminError("Неизвестная точка");
  return value;
}

async function mirrorSettings() {
  const settings = await loadSettings();
  if (!settings?.mirror) throw new AdminError(SCHEMA_HINT, 409);
  return settings;
}

/** Синхронизировать точку с таблицей сейчас (фото — с большим лимитом). */
export async function syncNow(rawStore: unknown, mode: "sync" | "new" | "replace" = "sync"): Promise<SyncReport> {
  const store = storeId(rawStore);
  await mirrorSettings();
  const result = await syncStore(store, { maxPhotos: 150, onlyNew: mode === "new", force: mode === "replace" });
  if (!result) throw new AdminError("Синхронизация этой точки уже идёт — подождите полминуты и обновите страницу.", 409);
  return result.report;
}

/**
 * Переключает источник точки.
 *  → «от админки»: сначала последняя синхронизация, чтобы в админке было ровно то, что сейчас в таблице.
 *  → «от таблицы»: сразу синхронизация — изменения таблицы, сделанные за это время, побеждают.
 */
export async function changeStoreSource(rawStore: unknown, rawSource: unknown): Promise<{ source: StoreSource; report?: SyncReport }> {
  const store = storeId(rawStore);
  if (rawSource !== "sheet" && rawSource !== "db") throw new AdminError("Неизвестный режим");
  const settings = await mirrorSettings();
  const current = sourceOf(settings, store);

  if (rawSource === "db") {
    const report = current === "sheet" ? await syncNow(store) : undefined;
    const stock = await selectAll("item_stock", { store_id: `eq.${store}`, limit: 1 });
    if (stock.length === 0) throw new AdminError("В базе нет товаров этой точки — сначала синхронизируйте её с таблицей.");
    await setStoreSource(store, "db");
    return { source: "db", report };
  }

  await setStoreSource(store, "sheet");
  const report = current === "db" ? await syncNow(store) : undefined;
  return { source: "sheet", report };
}

/** Короткий отчёт по-русски для админки. */
export function describeSync(title: string, r: SyncReport): string {
  const parts: string[] = [];
  if (r.lines.created) parts.push(`новых линеек: ${r.lines.created}`);
  if (r.items.created) parts.push(`новых позиций: ${r.items.created}`);
  if (r.stock.added) parts.push(`добавлено в точку: ${r.stock.added}`);
  if (r.stock.updated) parts.push(`обновлено наличие/цен: ${r.stock.updated}`);
  if (r.stock.removed) parts.push(`убрано (нет в таблице): ${r.stock.removed}`);
  if (r.photos.copied) parts.push(`фото: ${r.photos.copied}`);
  if (r.photos.pending) parts.push(`ещё фото в очереди: ${r.photos.pending}`);
  let text = `«${title}»: ${parts.length ? parts.join(", ") : "всё уже совпадает с таблицей"}`;
  if (r.stock.removalSkipped) text += ". Удаление пропущено: таблица прочиталась подозрительно короткой — проверьте её";
  return text;
}

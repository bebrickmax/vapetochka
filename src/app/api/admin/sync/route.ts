import { storeInfos } from "@/config/stores";
import { adminRoute, json, readJson } from "@/lib/admin/api";
import { describeSync, syncNow } from "@/lib/admin/sheet-mutations";
import { loadSettings, sourceOf } from "@/lib/db/sync";

/** Первая синхронизация копирует сотни фото — даём до 5 минут. */
export const maxDuration = 300;

/**
 * Подтянуть изменения Google Таблицы сейчас: { storeId } — одну точку, {} — все точки «от таблицы».
 * Отвечает { results: [{ storeId, text, changed }] }.
 */
export const POST = adminRoute(async (request) => {
  const { storeId } = await readJson<{ storeId?: string }>(request);
  const settings = await loadSettings();
  const ids = storeId ? [storeId] : storeInfos.filter((s) => settings?.mirror && sourceOf(settings, s.id) === "sheet").map((s) => s.id);
  const results = [];
  for (const id of ids) {
    const title = storeInfos.find((s) => s.id === id)?.title ?? id;
    try {
      const report = await syncNow(id);
      results.push({ storeId: id, text: describeSync(title, report), changed: report.changed, pendingPhotos: report.photos.pending });
    } catch (error) {
      results.push({ storeId: id, text: `«${title}»: ${error instanceof Error ? error.message : "ошибка синхронизации"}`, error: true });
    }
  }
  return json({ results });
});

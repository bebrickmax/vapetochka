import { adminRoute, json } from "@/lib/admin/api";
import { sheetAdminData, type SheetData } from "@/lib/admin/sheet-view";
import { storeInfos } from "@/config/stores";
import { getSheetCatalog } from "@/lib/catalog";
import { loadSnapshot } from "@/lib/db/catalog";
import { loadOverrides, loadStoreSources, type StoreSource } from "@/lib/db/overrides";

/**
 * Всё для админки: каталог базы (категории, линейки, позиции, наличие по точкам),
 * источник каждой точки и — для точек «от таблицы» — товары таблицы с правками поверх.
 */
export const GET = adminRoute(
  async () => {
    const [snapshot, saved] = await Promise.all([loadSnapshot(), loadStoreSources()]);
    const schemaReady = saved !== null;
    const sources: Record<string, StoreSource> = {};
    for (const { id } of storeInfos) {
      // Без таблицы настроек — как раньше: точка с товарами в базе работает от базы.
      sources[id] = saved ? (saved[id] ?? "sheet") : snapshot.stock.some((s) => s.store_id === id) ? "db" : "sheet";
    }

    const sheets: Record<string, SheetData> = {};
    const sheetErrors: Record<string, string> = {};
    await Promise.all(
      storeInfos
        .filter(({ id }) => sources[id] === "sheet")
        .map(async ({ id }) => {
          try {
            const [catalog, overrides] = await Promise.all([getSheetCatalog(id), loadOverrides(id)]);
            sheets[id] = sheetAdminData(catalog, overrides ?? []);
          } catch (error) {
            console.error(`[admin] Таблица «${id}» не загрузилась:`, error);
            sheetErrors[id] = "Не удалось прочитать Google Таблицу. Проверьте, что она открыта по ссылке, и обновите страницу.";
          }
        }),
    );

    return json({
      stores: storeInfos.map(({ id, title, short }) => ({ id, title, short })),
      ...snapshot,
      sources,
      sheets,
      sheetErrors,
      schemaReady,
    });
  },
  { mutates: false },
);

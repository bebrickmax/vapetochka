import { adminRoute, json } from "@/lib/admin/api";
import { storeInfos } from "@/config/stores";
import { loadSnapshot } from "@/lib/db/catalog";
import { loadSettings, sourceOf, type StoreSource } from "@/lib/db/sync";

/**
 * Всё для админки: каталог базы (категории, линейки, позиции, наличие по точкам)
 * и режим каждой точки («от таблицы» — база синхронизируется с Google Таблицей).
 */
export const GET = adminRoute(
  async () => {
    const [snapshot, settings] = await Promise.all([loadSnapshot(), loadSettings()]);
    const sources: Record<string, StoreSource> = {};
    const syncedAt: Record<string, string | null> = {};
    for (const { id } of storeInfos) {
      sources[id] = settings ? sourceOf(settings, id) : snapshot.stock.some((s) => s.store_id === id) ? "db" : "sheet";
      syncedAt[id] = settings?.rows.get(id)?.synced_at ?? null;
    }
    return json({
      stores: storeInfos.map(({ id, title, short }) => ({ id, title, short })),
      ...snapshot,
      sources,
      syncedAt,
      schemaReady: settings?.mirror === true,
    });
  },
  { mutates: false },
);

import { storeInfos } from "@/config/stores";
import { adminRoute, json, readJson } from "@/lib/admin/api";
import { changeStoreSource, describeSync } from "@/lib/admin/sheet-mutations";

/** Подготовка к переключению — последняя синхронизация с фото. */
export const maxDuration = 300;

/** Откуда точка берёт товары: { storeId, source: "sheet" | "db" }. */
export const PUT = adminRoute(async (request) => {
  const { storeId, source } = await readJson<{ storeId: unknown; source: unknown }>(request);
  const result = await changeStoreSource(storeId, source);
  const title = storeInfos.find((s) => s.id === storeId)?.title ?? String(storeId);
  return json({ source: result.source, ...(result.report && { text: describeSync(title, result.report) }) });
});

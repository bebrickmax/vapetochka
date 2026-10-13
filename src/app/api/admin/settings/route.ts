import { adminRoute, json, readJson } from "@/lib/admin/api";
import { changeStoreSource } from "@/lib/admin/sheet-mutations";

/** Откуда точка берёт товары: { storeId, source: "sheet" | "db" }. */
export const PUT = adminRoute(async (request) => {
  const { storeId, source } = await readJson<{ storeId: unknown; source: unknown }>(request);
  return json({ source: await changeStoreSource(storeId, source) });
});

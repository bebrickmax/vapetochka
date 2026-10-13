import { adminRoute, json, readJson } from "@/lib/admin/api";
import { updateStock } from "@/lib/admin/mutations";

/**
 * Наличие и цены: { updates: [{ itemId, storeId, inStock?, price? }] }.
 * Один тумблер — одна запись, массовое действие — много записей одним запросом.
 */
export const PATCH = adminRoute(async (request) => {
  const { updates } = await readJson<{ updates: unknown }>(request);
  return json({ changed: await updateStock(updates) });
});

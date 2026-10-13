import { adminRoute, json, readJson } from "@/lib/admin/api";
import { resetOverrides, updateOverrides } from "@/lib/admin/sheet-mutations";

/**
 * Быстрые правки поверх Google Таблицы (точка в режиме «таблица»):
 *   PATCH  { storeId, updates: [{ itemId, inStock?, price? }] }
 *   DELETE { storeId, itemIds? } — вернуть как в таблице (без itemIds — всю точку)
 */
export const PATCH = adminRoute(async (request) => {
  const { storeId, updates } = await readJson<{ storeId: unknown; updates: unknown }>(request);
  return json({ changed: await updateOverrides(storeId, updates) });
});

export const DELETE = adminRoute(async (request) => {
  const { storeId, itemIds } = await readJson<{ storeId: unknown; itemIds?: unknown }>(request);
  await resetOverrides(storeId, itemIds);
  return json({ ok: true });
});

import { adminRoute, json, readJson } from "@/lib/admin/api";
import { deleteItem, updateItem } from "@/lib/admin/mutations";

type Context = { params: Promise<{ id: string }> };

/** Изменить позицию: { title?, variant?, imageUrl?, stores? }. */
export const PATCH = adminRoute<Context>(async (request, { params }) => {
  const { id } = await params;
  return json(await updateItem(id, await readJson<Record<string, unknown>>(request)));
});

export const DELETE = adminRoute<Context>(async (_request, { params }) => {
  await deleteItem((await params).id);
  return json({ deleted: true });
});

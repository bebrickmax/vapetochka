import { adminRoute, json, readJson } from "@/lib/admin/api";
import { deleteLine, updateLine } from "@/lib/admin/mutations";

type Context = { params: Promise<{ id: string }> };

/** Изменить линейку: { name?, brand?, section?, note?, categoryId?, imageUrl? }. */
export const PATCH = adminRoute<Context>(async (request, { params }) => {
  const { id } = await params;
  return json(await updateLine(id, await readJson<Record<string, unknown>>(request)));
});

/** Удалить линейку вместе со всеми вкусами. */
export const DELETE = adminRoute<Context>(async (_request, { params }) => {
  return json({ deleted: true, ...(await deleteLine((await params).id)) });
});

import { adminRoute, json, readJson } from "@/lib/admin/api";
import { listTrash, restoreTrash } from "@/lib/admin/trash";

/** «Недавно удалённые» — последние 30 дней. */
export const GET = adminRoute(async () => json(await listTrash()), { mutates: false });

/** Вернуть запись: { id }. */
export const POST = adminRoute(async (request) => {
  const { id } = await readJson<{ id?: unknown }>(request);
  return json(await restoreTrash(id));
});

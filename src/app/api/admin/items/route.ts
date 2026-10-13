import { adminRoute, json, readJson } from "@/lib/admin/api";
import { createProducts, type CreateRequest } from "@/lib/admin/mutations";

/** Добавление вкусов/позиций — в существующую линейку или вместе с новой. */
export const POST = adminRoute(async (request) => json(await createProducts(await readJson<CreateRequest>(request)), 201));

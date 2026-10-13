import { adminRoute, json } from "@/lib/admin/api";
import { storeInfos } from "@/config/stores";
import { loadSnapshot } from "@/lib/db/catalog";

/** Весь каталог для админки: категории, линейки, позиции и наличие по точкам. */
export const GET = adminRoute(
  async () => json({ stores: storeInfos.map(({ id, title }) => ({ id, title })), ...(await loadSnapshot()) }),
  { mutates: false },
);

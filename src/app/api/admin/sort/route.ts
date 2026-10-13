import { adminRoute, json, readJson } from "@/lib/admin/api";
import { sortLines } from "@/lib/admin/mutations";

/** Вкусы по алфавиту: { lineId } — в одной линейке, {} — во всех. */
export const POST = adminRoute(
  async (request) => {
    const { lineId } = await readJson<{ lineId?: string }>(request);
    return json({ changed: await sortLines(lineId ? [lineId] : undefined) });
  },
  { mutates: true },
);

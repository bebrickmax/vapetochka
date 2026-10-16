import { storeInfos } from "@/config/stores";
import { loadSnapshot } from "@/lib/db/catalog";
import { DbError, insert, remove, selectAll } from "@/lib/db/supabase";
import { pluralize } from "@/lib/format";
import { itemRows, lineRows, planRestore, stockRows, TRASH_TABLE, type TrashEntry } from "@/lib/db/trash";
import { AdminError } from "./api";
import { uuid } from "./mutations";

/*
 * «Недавно удалённые» в админке: список и восстановление одной кнопкой.
 */

export const TRASH_SCHEMA_HINT =
  "Чтобы работали «Недавно удалённые», обновите базу: Supabase → SQL Editor → вставьте supabase/schema.sql → Run.";

export interface TrashListItem {
  id: string;
  kind: "line" | "item";
  label: string;
  storeIds: string[];
  source: "admin" | "sheet";
  deletedAt: string;
  /** Сколько вкусов в записи. */
  items: number;
}

const missingTable = (error: unknown) => error instanceof DbError && error.status === 404;

/** ready: false — таблицы журнала ещё нет (schema.sql не выполнен). */
export async function listTrash(): Promise<{ ready: boolean; entries: TrashListItem[] }> {
  try {
    const rows = await selectAll<TrashEntry>(TRASH_TABLE, { order: "deleted_at.desc,id.asc", limit: 300 });
    return {
      ready: true,
      entries: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        storeIds: r.store_ids ?? [],
        source: r.source,
        deletedAt: r.deleted_at,
        items: r.payload?.items?.length ?? 0,
      })),
    };
  } catch (error) {
    if (missingTable(error)) return { ready: false, entries: [] };
    throw error;
  }
}

async function insertAll(table: string, rows: object[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) await insert(table, rows.slice(i, i + 500), { onConflict, ignoreDuplicates: true });
}

/**
 * Возвращает запись журнала: линейку, вкусы (с фото, вариантом, «Новинкой» и порядком), наличие и цены
 * по точкам. Уже существующее не дублирует. После восстановления запись уходит из журнала.
 */
export async function restoreTrash(rawId: unknown): Promise<{ text: string }> {
  const id = uuid(rawId);
  let entry: TrashEntry | undefined;
  try {
    [entry] = await selectAll<TrashEntry>(TRASH_TABLE, { id: `eq.${id}` });
  } catch (error) {
    if (missingTable(error)) throw new AdminError(TRASH_SCHEMA_HINT, 409);
    throw error;
  }
  if (!entry) throw new AdminError("Эта запись уже восстановлена или удалена из журнала", 404);

  const plan = planRestore(entry.payload, await loadSnapshot());
  // Порядок важен: линейка → вкусы → наличие (ссылки между таблицами).
  await insertAll("product_lines", lineRows(plan.lines), "id");
  await insertAll("items", itemRows(plan.items), "id");
  await insertAll("item_stock", stockRows(plan.stock), "item_id,store_id");
  await remove(TRASH_TABLE, { id: `eq.${id}` });

  const stores = [...new Set(plan.stock.map((s) => s.store_id))].map((s) => storeInfos.find((x) => x.id === s)?.title ?? s);
  const parts: string[] = [];
  if (plan.lines.length) parts.push("линейка");
  if (plan.items.length) parts.push(`${plan.items.length} ${pluralize(plan.items.length, ["вкус", "вкуса", "вкусов"])}`);
  if (plan.existing.length) parts.push(`уже были на месте: ${plan.existing.join(", ")}`);
  if (parts.length === 0 && plan.stock.length === 0) return { text: `«${entry.label}» уже на месте — ничего не добавлено` };
  return {
    text: `Вернул «${entry.label}»${parts.length ? ` (${parts.join("; ")})` : ""}${stores.length ? ` — в точке: ${stores.join(", ")}` : ""}`,
  };
}

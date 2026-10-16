import { DbError, insert, remove } from "./supabase";
import { itemBaseKey, lineBaseKey } from "./sync-plan";
import type { DbItem, DbLine, DbSnapshot, DbStock } from "./types";

/*
 * «Недавно удалённые» — журнал удалений, из которого линейку или вкус можно вернуть одной кнопкой.
 *
 * Перед каждым удалением (в админке или синхронизацией, когда строку убрали из Google Таблицы) в таблицу
 * deleted_items кладётся полная копия: линейка, её позиции (название, вариант, фото, порядок, «Новинка»)
 * и строки наличия с ценами по точкам. Фото из хранилища при удалении не стираются, поэтому ссылки
 * в копии остаются рабочими. Журнал хранится 30 дней.
 *
 * Пока таблицы deleted_items нет (schema.sql ещё не выполнен), удаление работает как раньше — без журнала.
 */

export const TRASH_TABLE = "deleted_items";
export const TRASH_DAYS = 30;

export type TrashSource = "admin" | "sheet";

export interface TrashPayload {
  lines: DbLine[];
  items: DbItem[];
  stock: DbStock[];
}

export interface TrashDraft {
  /** line — линейка целиком, item — один или несколько вкусов линейки. */
  kind: "line" | "item";
  label: string;
  store_ids: string[];
  /** admin — удалили в админке, sheet — строку убрали из Google Таблицы. */
  source: TrashSource;
  payload: TrashPayload;
}

export interface TrashEntry extends TrashDraft {
  id: string;
  deleted_at: string;
}

const MAX_LABEL = 160;
const short = (text: string) => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text);
const uniq = <T>(values: T[]) => [...new Set(values)];

/** Копия линейки целиком (со всеми вкусами и наличием во всех точках). */
export function lineDraft(line: DbLine, items: DbItem[], stock: DbStock[], source: TrashSource): TrashDraft {
  return {
    kind: "line",
    label: short(line.name),
    store_ids: uniq(stock.map((s) => s.store_id)),
    source,
    payload: { lines: [line], items, stock },
  };
}

/** Копия вкусов одной линейки. Линейка тоже в копии — если её потом удалят, восстановление создаст её заново. */
export function itemsDraft(line: DbLine, items: DbItem[], stock: DbStock[], source: TrashSource): TrashDraft {
  return {
    kind: "item",
    label: short(`${line.name}: ${items.map((i) => i.title).join(", ")}`),
    store_ids: uniq(stock.map((s) => s.store_id)),
    source,
    payload: { lines: [line], items, stock },
  };
}

/**
 * Что убирает синхронизация (строки наличия точки + позиции и линейки, которые больше нигде не продаются) —
 * по записи на линейку. Позиции без наличия и пустые линейки (невидимые остатки) в журнал не попадают.
 */
export function removalDrafts(
  snapshot: DbSnapshot,
  removal: { storeId: string; stockItemIds: string[]; items: string[]; lines: string[] },
  source: TrashSource,
): TrashDraft[] {
  const removed = new Set(removal.stockItemIds);
  const deletedItems = new Set(removal.items);
  const deletedLines = new Set(removal.lines);
  const stock = snapshot.stock.filter((s) => (s.store_id === removal.storeId && removed.has(s.item_id)) || deletedItems.has(s.item_id));
  const visible = new Set(stock.map((s) => s.item_id));
  const byLine = new Map<string, DbItem[]>();
  for (const item of snapshot.items) {
    if (!visible.has(item.id)) continue;
    byLine.set(item.line_id, [...(byLine.get(item.line_id) ?? []), item]);
  }
  const drafts: TrashDraft[] = [];
  for (const line of snapshot.lines) {
    const items = byLine.get(line.id);
    if (!items?.length) continue;
    const ids = new Set(items.map((i) => i.id));
    const rows = stock.filter((s) => ids.has(s.item_id));
    drafts.push(deletedLines.has(line.id) ? lineDraft(line, items, rows, source) : itemsDraft(line, items, rows, source));
  }
  return drafts;
}

// ─── Восстановление ─────────────────────────────────────────────────────────

export interface RestorePlan {
  lines: DbLine[];
  items: DbItem[];
  stock: DbStock[];
  /** Вкусы, которые уже снова есть в линейке (их не дублируем, только возвращаем в точку). */
  existing: string[];
}

/**
 * Что вставить, чтобы вернуть запись журнала, — с учётом того, что есть в каталоге сейчас:
 *  • линейка или вкус на месте (тот же id или такое же название в той же линейке) — не дублируем;
 *  • ключ таблицы уже занят новой строкой — у восстановленной он снимается (иначе база не примет);
 *  • наличие и цены возвращаются как были, но без отметки «из таблицы»: восстановленное синхронизация
 *    не уберёт снова, а в админке его можно менять и удалять. Вернут строку в таблицу — свяжется сама.
 */
export function planRestore(payload: TrashPayload, current: DbSnapshot): RestorePlan {
  const plan: RestorePlan = { lines: [], items: [], stock: [], existing: [] };
  const lineIds = new Set(current.lines.map((l) => l.id));
  const lineByBase = new Map(current.lines.map((l) => [`${l.category_id}::${lineBaseKey(l)}`, l.id]));
  const lineKeys = new Set(current.lines.filter((l) => l.sheet_key).map((l) => `${l.category_id}::${l.sheet_key}`));

  const lineTarget = new Map<string, string>();
  for (const line of payload.lines) {
    if (lineIds.has(line.id)) {
      lineTarget.set(line.id, line.id);
      continue;
    }
    const same = lineByBase.get(`${line.category_id}::${lineBaseKey(line)}`);
    if (same) {
      lineTarget.set(line.id, same); // такую же линейку уже создали заново (например, из таблицы) — возвращаем вкусы в неё
      continue;
    }
    const keyTaken = !!line.sheet_key && lineKeys.has(`${line.category_id}::${line.sheet_key}`);
    plan.lines.push({ ...line, sheet_key: keyTaken ? null : (line.sheet_key ?? null) });
    lineTarget.set(line.id, line.id);
  }

  const itemIds = new Set(current.items.map((i) => i.id));
  const itemByBase = new Map(current.items.map((i) => [`${i.line_id}::${itemBaseKey(i)}`, i.id]));
  const itemKeys = new Set(current.items.filter((i) => i.sheet_key).map((i) => `${i.line_id}::${i.sheet_key}`));
  const itemTarget = new Map<string, string>();
  for (const item of payload.items) {
    if (itemIds.has(item.id)) {
      itemTarget.set(item.id, item.id);
      continue;
    }
    const lineId = lineTarget.get(item.line_id) ?? (lineIds.has(item.line_id) ? item.line_id : undefined);
    if (!lineId) continue;
    const same = itemByBase.get(`${lineId}::${itemBaseKey(item)}`);
    if (same) {
      itemTarget.set(item.id, same);
      plan.existing.push(item.title);
      continue;
    }
    const keyTaken = !!item.sheet_key && itemKeys.has(`${lineId}::${item.sheet_key}`);
    plan.items.push({ ...item, line_id: lineId, sheet_key: keyTaken ? null : (item.sheet_key ?? null) });
    itemTarget.set(item.id, item.id);
  }

  const present = new Set(current.stock.map((s) => `${s.item_id}::${s.store_id}`));
  for (const row of payload.stock) {
    const itemId = itemTarget.get(row.item_id);
    if (!itemId || present.has(`${itemId}::${row.store_id}`)) continue;
    present.add(`${itemId}::${row.store_id}`);
    plan.stock.push({ ...row, item_id: itemId, sheet_status: null, sheet_price: null });
  }
  return plan;
}

// ─── Строки для записи ──────────────────────────────────────────────────────

/** Только известные колонки; «Новинка» — у всех строк или ни у одной (иначе PostgREST не примет пачку). */
export function lineRows(lines: DbLine[]) {
  const badge = lines.some((l) => l.is_new !== undefined);
  return lines.map((l) => ({
    id: l.id,
    category_id: l.category_id,
    brand: l.brand,
    section: l.section,
    name: l.name,
    note: l.note,
    image_url: l.image_url,
    sort: l.sort,
    sheet_key: l.sheet_key ?? null,
    ...(badge && { is_new: l.is_new ?? false }),
  }));
}

export function itemRows(items: DbItem[]) {
  const badge = items.some((i) => i.is_new !== undefined);
  return items.map((i) => ({
    id: i.id,
    line_id: i.line_id,
    title: i.title,
    variant: i.variant,
    image_url: i.image_url,
    sort: i.sort,
    sheet_key: i.sheet_key ?? null,
    ...(badge && { is_new: i.is_new ?? false }),
  }));
}

export function stockRows(stock: DbStock[]) {
  return stock.map((s) => ({
    item_id: s.item_id,
    store_id: s.store_id,
    price: s.price,
    old_price: s.old_price,
    in_stock: s.in_stock,
    sheet_status: s.sheet_status ?? null,
    sheet_price: s.sheet_price ?? null,
  }));
}

// ─── Запись в журнал ────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Кладёт копии в журнал. false — журнала ещё нет в базе (старая схема): удалять можно, как раньше.
 * Любая другая ошибка пробрасывается — без копии не удаляем.
 */
export async function journal(drafts: TrashDraft[]): Promise<{ ids: string[] } | false> {
  if (drafts.length === 0) return { ids: [] };
  let ids: string[] = [];
  try {
    for (let i = 0; i < drafts.length; i += 50) {
      const rows = await insert<{ id: string }>(TRASH_TABLE, drafts.slice(i, i + 50));
      ids = [...ids, ...rows.map((r) => r.id)];
    }
  } catch (error) {
    if (error instanceof DbError && error.status === 404) return false;
    throw error;
  }
  // Старше 30 дней — убираем (не страшно, если не получилось: уберём в следующий раз).
  const before = iso(new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000));
  await remove(TRASH_TABLE, { deleted_at: `lt.${before}` }).catch((e) => console.error("[trash] Не удалось убрать старые записи:", e));
  return { ids };
}

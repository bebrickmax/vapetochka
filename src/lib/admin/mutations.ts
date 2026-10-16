import { getStore, storeInfos } from "@/config/stores";
import { DbError, insert, inList, remove, selectAll, update } from "@/lib/db/supabase";
import type { DbItem, DbLine, DbStock } from "@/lib/db/types";
import { loadSettings, sourceOf } from "@/lib/db/sync";
import { alphabeticalOrderByLine, compareTitles } from "@/lib/sort";
import { AdminError } from "./api";

/*
 * Изменения каталога из админки. Все входные данные проверяются здесь —
 * роуты только передают тело запроса.
 */

const MAX_TEXT = 300;
const CHUNK = 150; // id в одном фильтре in.(…) — чтобы адрес запроса не был слишком длинным

function text(value: unknown, field: string, { required = false } = {}): string | null {
  if (value === undefined || value === null) {
    if (required) throw new AdminError(`Заполните поле «${field}»`);
    return null;
  }
  if (typeof value !== "string") throw new AdminError(`Поле «${field}» должно быть текстом`);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (required && !trimmed) throw new AdminError(`Заполните поле «${field}»`);
  if (trimmed.length > MAX_TEXT) throw new AdminError(`Поле «${field}» слишком длинное`);
  return trimmed || null;
}

function price(value: unknown, field = "Цена"): number | null {
  if (value === null || value === "" || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new AdminError(`Проверьте поле «${field}»`);
  return Math.round(n * 100) / 100;
}

function storeId(value: unknown): string {
  if (typeof value !== "string" || !getStore(value)) throw new AdminError("Неизвестная точка");
  return value;
}

function stores(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new AdminError("Выберите хотя бы одну точку");
  return [...new Set(value.map(storeId))];
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new AdminError("Неверный id");
  return value;
}

function url(value: unknown): string | null {
  const v = text(value, "Фото");
  if (v && !/^https:\/\/\S+$/.test(v)) throw new AdminError("Ссылка на фото должна начинаться с https://");
  return v;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new AdminError(`Поле «${field}» должно быть да/нет`);
  return value;
}

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

export const NEW_BADGE_SCHEMA_HINT =
  "Чтобы работала метка «Новинка», обновите базу: Supabase → SQL Editor → вставьте supabase/schema.sql → Run.";

/** Запись с меткой «Новинка» в базу без колонки is_new — понятная подсказка вместо «база не ответила». */
async function withNewBadge<T>(write: () => Promise<T>, usesBadge: boolean): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (usesBadge && error instanceof DbError && error.status === 400 && /is_new/.test(error.message))
      throw new AdminError(NEW_BADGE_SCHEMA_HINT, 409);
    throw error;
  }
}

// ─── Что пришло из Google Таблицы ───────────────────────────────────────────

const LOCKED =
  "Эта позиция из Google Таблицы, а точка работает от таблицы — название, вкусы и удаление меняются в самой таблице. Здесь можно менять наличие, цену и фото.";

/** Точки «от таблицы». */
async function sheetStores(): Promise<Set<string>> {
  const settings = await loadSettings();
  if (!settings?.mirror) return new Set();
  return new Set(storeInfos.filter((s) => sourceOf(settings, s.id) === "sheet").map((s) => s.id));
}

/** Позиции, которые синхронизация ведёт из таблицы в точках «от таблицы» (их поля меняет таблица). */
async function lockedItems(itemIds: string[]): Promise<Set<string>> {
  const stores = await sheetStores();
  const locked = new Set<string>();
  if (stores.size === 0 || itemIds.length === 0) return locked;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const rows = await selectAll<DbStock>("item_stock", {
      select: "item_id,store_id,sheet_status",
      item_id: inList(itemIds.slice(i, i + CHUNK)),
      sheet_status: "not.is.null",
    });
    for (const r of rows) if (stores.has(r.store_id)) locked.add(r.item_id);
  }
  return locked;
}

async function lineItems(lineId: string): Promise<DbItem[]> {
  return selectAll<DbItem>("items", { line_id: `eq.${lineId}` });
}

async function isLineLocked(lineId: string): Promise<boolean> {
  return (await lockedItems((await lineItems(lineId)).map((i) => i.id))).size > 0;
}

/**
 * Ставит новые позиции на место по алфавиту, не трогая порядок остальных
 * (в линейке из таблицы порядок задаёт таблица).
 */
async function placeAlphabetically(lineId: string, newIds: string[]) {
  const items = (await lineItems(lineId)).sort((a, b) => a.sort - b.sort);
  const fresh = new Set(newIds);
  const others = items.filter((i) => !fresh.has(i.id));
  const rows: { id: string; line_id: string; title: string; sort: number }[] = [];
  for (const item of items.filter((i) => fresh.has(i.id)).sort(compareTitles)) {
    const at = others.findIndex((o) => compareTitles(item, o) < 0);
    const prev = at === -1 ? others.at(-1) : others[at - 1];
    const next = at === -1 ? undefined : others[at];
    const sort = !next ? (prev?.sort ?? 0) + 10 : !prev ? next.sort - 10 : prev.sort + Math.max(1, Math.floor((next.sort - prev.sort) / 2));
    rows.push({ id: item.id, line_id: lineId, title: item.title, sort });
    others.splice(at === -1 ? others.length : at, 0, { ...item, sort });
  }
  if (rows.length) await insert("items", rows, { onConflict: "id" });
}

/** Новые/переименованные позиции — на место по алфавиту. */
async function arrange(lineId: string, itemIds: string[]) {
  if (await isLineLocked(lineId)) await placeAlphabetically(lineId, itemIds);
  else await sortLines([lineId]);
}

// ─── Наличие и цены ──────────────────────────────────────────────────────────

export interface StockUpdate {
  itemId: string;
  storeId: string;
  inStock?: boolean;
  price?: number | string | null;
}

/** Меняет наличие/цену у одной или многих позиций (массовые действия — одним запросом на группу). */
export async function updateStock(raw: unknown): Promise<number> {
  if (!Array.isArray(raw) || raw.length === 0) throw new AdminError("Нет изменений");
  if (raw.length > 5000) throw new AdminError("Слишком много позиций за раз");

  // Группируем одинаковые изменения: «нет в наличии» для 300 вкусов — пара запросов.
  const groups = new Map<string, { store: string; patch: Record<string, unknown>; ids: string[] }>();
  for (const u of raw as StockUpdate[]) {
    const patch: Record<string, unknown> = {};
    if (has(u, "inStock")) {
      if (typeof u.inStock !== "boolean") throw new AdminError("Неверное наличие");
      patch.in_stock = u.inStock;
    }
    if (has(u, "price")) patch.price = price(u.price);
    if (Object.keys(patch).length === 0) continue;
    const store = storeId(u.storeId);
    const key = `${store}|${JSON.stringify(patch)}`;
    const group = groups.get(key) ?? { store, patch, ids: [] };
    group.ids.push(uuid(u.itemId));
    groups.set(key, group);
  }

  let changed = 0;
  for (const { store, patch, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const rows = await update<DbStock>("item_stock", { store_id: `eq.${store}`, item_id: inList(ids.slice(i, i + CHUNK)) }, patch);
      changed += rows.length;
    }
  }
  return changed;
}

// ─── Позиции ────────────────────────────────────────────────────────────────

export async function updateItem(id: string, body: Record<string, unknown>): Promise<DbItem> {
  const itemId = uuid(id);
  if ((has(body, "title") || has(body, "variant") || has(body, "stores")) && (await lockedItems([itemId])).size) throw new AdminError(LOCKED);
  const patch: Record<string, unknown> = {};
  if (has(body, "title")) patch.title = text(body.title, "Название", { required: true });
  if (has(body, "variant")) patch.variant = text(body.variant, "Вариант");
  if (has(body, "imageUrl")) patch.image_url = url(body.imageUrl);
  // «Новинка» — своя метка админки, её можно ставить и позициям из таблицы.
  if (has(body, "isNew")) patch.is_new = flag(body.isNew, "Новинка");

  let item: DbItem | undefined;
  if (Object.keys(patch).length) [item] = await withNewBadge(() => update<DbItem>("items", { id: `eq.${itemId}` }, patch), "is_new" in patch);
  else [item] = await selectAll<DbItem>("items", { id: `eq.${itemId}` });
  if (!item) throw new AdminError("Позиция не найдена", 404);
  if (patch.title !== undefined || patch.variant !== undefined) await arrange(item.line_id, [item.id]);

  // В каких точках продаётся: добавляем недостающие строки наличия, лишние убираем.
  if (has(body, "stores")) {
    const wanted = stores(body.stores);
    const current = await selectAll<DbStock>("item_stock", { item_id: `eq.${itemId}` });
    const template = current[0];
    const add = wanted.filter((s) => !current.some((c) => c.store_id === s));
    const drop = current.filter((c) => !wanted.includes(c.store_id)).map((c) => c.store_id);
    if (add.length) {
      await insert(
        "item_stock",
        add.map((s) => ({ item_id: itemId, store_id: s, price: template?.price ?? null, in_stock: true })),
      );
    }
    if (drop.length) await remove("item_stock", { item_id: `eq.${itemId}`, store_id: inList(drop) });
  }
  return item;
}

export async function deleteItem(id: string) {
  const itemId = uuid(id);
  if ((await lockedItems([itemId])).size) throw new AdminError(LOCKED);
  await remove("items", { id: `eq.${itemId}` });
}

// ─── Линейки ────────────────────────────────────────────────────────────────

export async function updateLine(id: string, body: Record<string, unknown>): Promise<DbLine> {
  const patch: Record<string, unknown> = {};
  if (has(body, "name")) patch.name = text(body.name, "Название линейки", { required: true });
  if (has(body, "brand")) patch.brand = text(body.brand, "Бренд");
  if (has(body, "section")) patch.section = text(body.section, "Подраздел");
  if (has(body, "note")) patch.note = text(body.note, "Пояснение");
  if (has(body, "categoryId")) patch.category_id = text(body.categoryId, "Категория", { required: true });
  if (has(body, "imageUrl")) patch.image_url = url(body.imageUrl);
  if (has(body, "isNew")) patch.is_new = flag(body.isNew, "Новинка");
  if (Object.keys(patch).length === 0) throw new AdminError("Нет изменений");
  const fromSheet = ["name", "brand", "section", "note", "category_id"].some((k) => k in patch);
  if (fromSheet && (await isLineLocked(uuid(id))))
    throw new AdminError("Эта линейка из Google Таблицы — название, бренд, категория и пояснение меняются в таблице. Здесь можно менять фото, наличие и цены.");
  const [line] = await withNewBadge(() => update<DbLine>("product_lines", { id: `eq.${uuid(id)}` }, patch), "is_new" in patch);
  if (!line) throw new AdminError("Линейка не найдена", 404);
  return line;
}

export async function deleteLine(id: string) {
  if (await isLineLocked(uuid(id))) throw new AdminError("Эта линейка из Google Таблицы — удалите её в таблице.");
  await remove("product_lines", { id: `eq.${uuid(id)}` }); // позиции и наличие удалятся каскадом
}

// ─── Добавление товара ──────────────────────────────────────────────────────

export interface CreateRequest {
  /** Добавить в существующую линейку… */
  lineId?: string;
  /** …или создать новую. */
  line?: { categoryId: string; brand?: string; name: string; imageUrl?: string; note?: string };
  /** Вкусы/позиции — каждая строка отдельно. */
  titles: string[];
  variant?: string;
  price?: number | string | null;
  stores: string[];
  inStock?: boolean;
  /** Метка «Новинка!»: новой линейке — на всю линейку, в существующую — на добавленные вкусы. */
  isNew?: boolean;
}

export async function createProducts(body: CreateRequest): Promise<{ line: DbLine; items: DbItem[] }> {
  const titles = (Array.isArray(body.titles) ? body.titles : [])
    .map((t) => text(t, "Вкус"))
    .filter((t): t is string => !!t);
  if (titles.length === 0) throw new AdminError("Добавьте хотя бы один вкус или позицию");
  if (titles.length > 200) throw new AdminError("Не больше 200 позиций за раз");
  const targetStores = stores(body.stores);
  const itemPrice = price(body.price);
  const variant = text(body.variant, "Вариант");
  const inStock = body.inStock !== false;
  const isNew = body.isNew === true;
  // Колонку пишем, только когда метка нужна, — так добавление работает и в базе без колонки is_new.
  const badge = isNew ? { is_new: true } : {};

  let line: DbLine | undefined;
  if (body.lineId) {
    [line] = await selectAll<DbLine>("product_lines", { id: `eq.${uuid(body.lineId)}` });
    if (!line) throw new AdminError("Линейка не найдена", 404);
  } else {
    const l = body.line ?? ({} as NonNullable<CreateRequest["line"]>);
    const categoryId = text(l.categoryId, "Категория", { required: true })!;
    const last = await selectAll<DbLine>("product_lines", {
      category_id: `eq.${categoryId}`,
      order: "sort.desc",
      limit: 1,
    });
    const row = {
      category_id: categoryId,
      brand: text(l.brand, "Бренд"),
      name: text(l.name, "Название линейки", { required: true }),
      note: text(l.note, "Пояснение"),
      image_url: url(l.imageUrl),
      sort: (last[0]?.sort ?? 0) + 10,
      ...badge,
    };
    [line] = await withNewBadge(() => insert<DbLine>("product_lines", row), isNew);
  }
  const newLine = !body.lineId;

  const lastItem = await selectAll<DbItem>("items", { line_id: `eq.${line.id}`, order: "sort.desc", limit: 1 });
  const base = lastItem[0]?.sort ?? 0;
  const items = await withNewBadge(
    () =>
      insert<DbItem>(
        "items",
        // Новая линейка помечается целиком, а вкусы в существующей — каждый.
        titles.map((title, i) => ({ line_id: line!.id, title, variant, sort: base + (i + 1) * 10, ...(newLine ? {} : badge) })),
      ),
    isNew && !newLine,
  );
  await insert(
    "item_stock",
    items.flatMap((item) =>
      targetStores.map((store) => ({ item_id: item.id, store_id: store, price: itemPrice, in_stock: inStock })),
    ),
  );
  await arrange(line.id, items.map((i) => i.id)); // новый вкус сразу встаёт на своё место по алфавиту
  return { line, items };
}

// ─── Сортировка ─────────────────────────────────────────────────────────────

/**
 * Расставляет вкусы по алфавиту (эмодзи в начале не учитываются).
 * Без lineIds — во всех линейках. Пишет только изменившиеся позиции, пачками.
 */
export async function sortLines(lineIds?: string[]): Promise<number> {
  const ids = lineIds?.map(uuid);
  let items: DbItem[] = [];
  if (!ids) items = await selectAll<DbItem>("items", { order: "id.asc" });
  else for (let i = 0; i < ids.length; i += CHUNK) items.push(...(await selectAll<DbItem>("items", { line_id: inList(ids.slice(i, i + CHUNK)) })));

  // Линейки из таблицы (точка «от таблицы») держат порядок таблицы — их не трогаем.
  const locked = await lockedItems(items.map((i) => i.id));
  const lockedLines = new Set(items.filter((i) => locked.has(i.id)).map((i) => i.line_id));
  const order = alphabeticalOrderByLine(items.filter((i) => !lockedLines.has(i.line_id)));
  if (order.size === 0) return 0;
  const rows = items
    .filter((item) => order.has(item.id))
    .map((item) => ({ id: item.id, line_id: item.line_id, title: item.title, sort: order.get(item.id)! }));
  for (let i = 0; i < rows.length; i += 500) await insert("items", rows.slice(i, i + 500), { onConflict: "id" });
  return rows.length;
}

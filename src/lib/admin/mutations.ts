import { getStore } from "@/config/stores";
import { insert, inList, remove, selectAll, update } from "@/lib/db/supabase";
import type { DbItem, DbLine, DbStock } from "@/lib/db/types";
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

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

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
  const patch: Record<string, unknown> = {};
  if (has(body, "title")) patch.title = text(body.title, "Название", { required: true });
  if (has(body, "variant")) patch.variant = text(body.variant, "Вариант");
  if (has(body, "imageUrl")) patch.image_url = url(body.imageUrl);

  let item: DbItem | undefined;
  if (Object.keys(patch).length) [item] = await update<DbItem>("items", { id: `eq.${itemId}` }, patch);
  else [item] = await selectAll<DbItem>("items", { id: `eq.${itemId}` });
  if (!item) throw new AdminError("Позиция не найдена", 404);

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
  await remove("items", { id: `eq.${uuid(id)}` });
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
  if (Object.keys(patch).length === 0) throw new AdminError("Нет изменений");
  const [line] = await update<DbLine>("product_lines", { id: `eq.${uuid(id)}` }, patch);
  if (!line) throw new AdminError("Линейка не найдена", 404);
  return line;
}

export async function deleteLine(id: string) {
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
    [line] = await insert<DbLine>("product_lines", {
      category_id: categoryId,
      brand: text(l.brand, "Бренд"),
      name: text(l.name, "Название линейки", { required: true }),
      note: text(l.note, "Пояснение"),
      image_url: url(l.imageUrl),
      sort: (last[0]?.sort ?? 0) + 10,
    });
  }

  const lastItem = await selectAll<DbItem>("items", { line_id: `eq.${line.id}`, order: "sort.desc", limit: 1 });
  const base = lastItem[0]?.sort ?? 0;
  const items = await insert<DbItem>(
    "items",
    titles.map((title, i) => ({ line_id: line!.id, title, variant, sort: base + (i + 1) * 10 })),
  );
  await insert(
    "item_stock",
    items.flatMap((item) =>
      targetStores.map((store) => ({ item_id: item.id, store_id: store, price: itemPrice, in_stock: inStock })),
    ),
  );
  return { line, items };
}

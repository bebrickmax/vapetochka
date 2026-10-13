/** Строки таблиц базы (см. supabase/schema.sql). */

export interface DbCategory {
  id: string;
  title: string;
  sort: number;
}

export interface DbLine {
  id: string;
  category_id: string;
  brand: string | null;
  section: string | null;
  name: string;
  note: string | null;
  image_url: string | null;
  sort: number;
}

export interface DbItem {
  id: string;
  line_id: string;
  title: string;
  variant: string | null;
  image_url: string | null;
  sort: number;
}

export interface DbStock {
  item_id: string;
  store_id: string;
  price: number | string | null;
  old_price: number | string | null;
  in_stock: boolean;
}

/** Всё содержимое каталога — то, что получает админка. */
export interface DbSnapshot {
  categories: DbCategory[];
  lines: DbLine[];
  items: DbItem[];
  stock: DbStock[];
}

/** PostgREST отдаёт numeric числом, но на всякий случай понимаем и строку. */
export function toPrice(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

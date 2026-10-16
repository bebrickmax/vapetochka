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
  /** Ключ линейки в Google Таблице (null — линейка добавлена в админке). */
  sheet_key?: string | null;
  /** Метка «Новинка!» (нет колонки — база ещё не обновлена). */
  is_new?: boolean;
}

export interface DbItem {
  id: string;
  line_id: string;
  title: string;
  variant: string | null;
  image_url: string | null;
  sort: number;
  /** Ключ позиции внутри линейки в Google Таблице (null — добавлена в админке). */
  sheet_key?: string | null;
  /** Метка «Новинка!» у отдельного вкуса. */
  is_new?: boolean;
}

export interface DbStock {
  item_id: string;
  store_id: string;
  price: number | string | null;
  old_price: number | string | null;
  in_stock: boolean;
  /**
   * Наличие и цена в Google Таблице при последней синхронизации (null — позиция не из таблицы).
   * Синхронизация меняет наличие/цену, только если в таблице они изменились с прошлого раза:
   * так правка из админки живёт, пока ту же клетку не поменяют в таблице.
   */
  sheet_status?: "in" | "out" | "unknown" | null;
  sheet_price?: number | string | null;
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

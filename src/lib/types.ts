/** Наличие товара: ✅ → "in", ❌ → "out", без отметки → "unknown". */
export type StockStatus = "in" | "out" | "unknown";

/** Одна позиция внутри линейки (вкус, цвет, сопротивление и т.д.). */
export interface ProductItem {
  name: string;
  emoji?: string;
  description?: string;
  /** Доп. характеристика из соседней колонки, например "0.6 Ом". */
  variant?: string;
  price: number | null;
  /** Старая цена (для распродажи: две цены подряд в колонке A). */
  oldPrice?: number;
  status: StockStatus;
}

/** Линейка/группа товаров: заголовок + цена + список позиций. */
export interface ProductGroup {
  categoryId: string;
  /** Бренд/раздел над линейкой, например "Tasty Lab". */
  brand?: string;
  /** Название линейки, например "Skala 20mg". */
  line: string;
  /** Крепость, вытащенная из названия: "20 мг", "5%". */
  strength?: string;
  /** Пояснение под заголовком, например "Цена за пару". */
  note?: string;
  items: ProductItem[];
}

export interface Category {
  id: string;
  title: string;
  icon: string;
  sheetTitle: string;
}

export type CatalogSource = "api" | "csv" | "demo";

/** Оптовые цены — отдельный лист, показывается во вкладке «Акции и ОПТ». */
export interface Wholesale {
  groups: ProductGroup[];
  /** Строки листа как текст — если лист устроен не как прайс. */
  lines: string[];
}

export interface Catalog {
  categories: Category[];
  groups: ProductGroup[];
  wholesale?: Wholesale;
  updatedAt: string;
  source: CatalogSource;
}

/** Плоская карточка товара — то, что видит покупатель. */
export interface Product extends Omit<ProductItem, "name"> {
  id: string;
  categoryId: string;
  brand?: string;
  line: string;
  name: string;
  strength?: string;
  note?: string;
}

/** Сырые данные одного листа таблицы. */
export interface RawSheet {
  title: string;
  rows: string[][];
}

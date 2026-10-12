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
  /** Фото позиции, если в таблице у неё своя картинка (например, у испарителей). */
  image?: string;
}

/** Линейка/группа товаров: заголовок + цена + список позиций. */
export interface ProductGroup {
  /** Уникальный в пределах каталога идентификатор линейки. */
  id: string;
  categoryId: string;
  /** Бренд/производитель над линейкой в таблице, например "Tasty Lab". */
  brand?: string;
  /**
   * Бренд для фильтра-«чипса» в категории: бренд из таблицы, а если его
   * нет — общее начало названия соседних линеек ("Drymost", "Elfbar").
   */
  family?: string;
  /** Подраздел листа, например "Картриджи" на листе расходников. */
  section?: string;
  /** Название линейки, например "Skala 20mg". */
  line: string;
  /** Крепость, вытащенная из названия: "20 мг", "5%". */
  strength?: string;
  /** Пояснение под заголовком, например "Цена за пару". */
  note?: string;
  /** Фото линейки — картинка из колонки A таблицы. */
  image?: string;
  items: ProductItem[];
}

export interface Category {
  id: string;
  title: string;
  icon: string;
  sheetTitle: string;
}

export type CatalogSource = "api" | "csv" | "demo";

/** Позиция оптового прайса: до четырёх цен по количеству (от 10, 30, 50, 100 шт). */
export interface WholesaleItem {
  name: string;
  prices: (number | null)[];
  image?: string;
}

export interface WholesaleBrand {
  title: string;
  items: WholesaleItem[];
}

export interface WholesaleSection {
  title: string;
  brands: WholesaleBrand[];
}

/** Оптовые цены — лист «ОПТ», показывается во вкладке «Акции и ОПТ». */
export interface Wholesale {
  /** Подписи ступеней цены: «от 10 шт», «от 30 шт»… */
  tiers: string[];
  sections: WholesaleSection[];
  /** Строки листа как текст — если лист устроен не как прайс. */
  lines: string[];
}

export interface Catalog {
  /** Точка продаж (основной склад / Каменная Горка). */
  storeId: string;
  categories: Category[];
  groups: ProductGroup[];
  wholesale?: Wholesale;
  updatedAt: string;
  source: CatalogSource;
}

/** Плоская позиция — то, что попадает в корзину и поиск. */
export interface Product extends Omit<ProductItem, "name"> {
  id: string;
  groupId: string;
  categoryId: string;
  brand?: string;
  family?: string;
  line: string;
  name: string;
  strength?: string;
  note?: string;
}

/** Сырые данные одного листа таблицы. */
export interface RawSheet {
  title: string;
  rows: string[][];
  /** gid листа — по нему подтягиваются фото. */
  gid?: string;
  /** Фото из колонки A: номер строки (с 0) → адрес картинки. */
  images?: Record<number, string>;
}

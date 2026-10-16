/**
 * Основные настройки сайта. Значения можно переопределить через .env
 * (см. .env.example и HOW_TO_UPDATE.md).
 */
export const siteConfig = {
  name: "VapeTochka",
  /** Как магазин называется на экране — как на логотипе. */
  displayName: "Vape Точка",
  description:
    "Каталог VapeTochka: жидкости, поды, одноразки, расходники. Актуальное наличие и цены, заказ в Telegram.",
  currency: "BYN",
  timeZone: "Europe/Minsk",
  telegramManager: process.env.NEXT_PUBLIC_TG_MANAGER || "VapeTochkaManager",
} as const;

/**
 * Как читаются таблицы. ID самих таблиц — в src/config/stores.ts
 * (у каждой точки продаж своя таблица).
 */
export const sheetsConfig = {
  /**
   * Ключ Google API (необязательно). Без ключа список листов и фото
   * читаются из опубликованной по ссылке таблицы, а данные — CSV-выгрузкой.
   */
  apiKey: process.env.GOOGLE_API_KEY || "",
  /**
   * Листы, которые никогда не показываются на сайте (через запятую в .env).
   * Скрытые в Google Таблице листы и пустые листы исключаются автоматически.
   */
  excludedSheets: (process.env.EXCLUDED_SHEETS ?? "ОПТ")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * Лист с оптовыми ценами: не попадает в каталог, а показывается
   * во вкладке «Акции и ОПТ». Пустое значение — раздел ОПТ скрыт.
   */
  wholesaleSheet: process.env.WHOLESALE_SHEET ?? "ОПТ",
  /** Колонки, которые читаются с каждого листа. */
  columns: "A:H",
  /** Подписи оптовых цен по порядку колонок листа «ОПТ». */
  wholesaleTiers: ["от 10 шт", "от 30 шт", "от 50 шт", "от 100 шт"],
} as const;

export const cacheConfig = {
  /** Как часто (в секундах) сайт перечитывает таблицу сам. */
  revalidateSeconds: 60,
  tag: "catalog",
  /** Сырые данные Google Таблиц — сбрасываются при правке таблицы. */
  sheetsTag: "sheets",
  /** Лист «ОПТ» — свой кэш: при сбое Google остаётся прошлый. */
  wholesaleTag: "wholesale",
  /** Режимы точек («от таблицы» / «от админки») с прошлого удачного чтения базы. */
  settingsTag: "settings",
} as const;

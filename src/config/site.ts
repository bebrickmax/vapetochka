/**
 * Основные настройки сайта. Значения можно переопределить через .env
 * (см. .env.example и HOW_TO_UPDATE.md).
 */
export const siteConfig = {
  name: "VapeTochka",
  description:
    "Каталог VapeTochka: жидкости, поды, одноразки, расходники. Актуальное наличие и цены, заказ в Telegram.",
  currency: "BYN",
  timeZone: "Europe/Minsk",
  telegramManager: process.env.NEXT_PUBLIC_TG_MANAGER || "VapeTochkaManager",
} as const;

export const sheetsConfig = {
  /** ID таблицы — часть ссылки между /d/ и /edit. */
  spreadsheetId:
    process.env.GOOGLE_SHEET_ID || "1T3SgqBTTdbUlBjC4UnRKk0G8mbqJK-5RJigP7azr3Rc",
  /** Ключ Google API. Если задан — листы подхватываются автоматически. */
  apiKey: process.env.GOOGLE_API_KEY || "",
  /**
   * Листы, которые никогда не показываются на сайте (через запятую в .env).
   * Скрытые в Google Таблице листы и пустые листы исключаются автоматически.
   */
  excludedSheets: (process.env.EXCLUDED_SHEETS ?? "ОПТ")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Колонки, которые читаются с каждого листа. */
  columns: "A:H",
  /**
   * Режим без API-ключа: какие листы читать (название + gid из ссылки).
   * gid — число после "#gid=" в адресной строке, когда открыт нужный лист.
   */
  csvTabs: [
    { title: "Жидкости ( salt)", gid: "618442738" },
    { title: "Расходники ", gid: "697847360" },
    { title: "Одноразки", gid: "1156669168" },
    { title: "Снюс", gid: "1228656279" },
    { title: "Пластины", gid: "1565031505" },
    { title: "Поды", gid: "1209278120" },
    { title: "Койла, Вата и др.", gid: "381658474" },
    { title: "Кальяный табак", gid: "942197141" },
    { title: "Напитки", gid: "1286166836" },
  ],
} as const;

export const cacheConfig = {
  /** Как часто (в секундах) сайт перечитывает таблицу сам. */
  revalidateSeconds: 60,
  tag: "catalog",
} as const;

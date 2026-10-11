/**
 * Точки продаж. У каждой — своя Google Таблица с наличием.
 * При первом входе покупатель выбирает точку, сайт запоминает выбор
 * на устройстве, а сменить точку можно кнопкой в шапке.
 *
 * ID таблиц можно переопределить через .env (см. .env.example).
 */

/** Как покупатель может получить заказ в этой точке. */
export type StoreCheckout =
  /** Метро, самовывоз из нескольких точек, доставка. */
  | { kind: "full" }
  /** Только самовывоз из одной точки. */
  | { kind: "pickup-only"; point: string };

export interface Store {
  /** Часть адреса сайта: /main, /kamennaya-gorka. */
  id: string;
  /** Название на экране выбора и в шапке. */
  title: string;
  /** Короткое название для кнопки в шапке. */
  short: string;
  /** Подпись под названием на экране выбора. */
  subtitle: string;
  icon: string;
  spreadsheetId: string;
  /**
   * Листы для режима без API-ключа, если не удалось прочитать их список
   * из таблицы автоматически (название + gid из ссылки «#gid=…»).
   */
  fallbackTabs: readonly { title: string; gid: string }[];
  checkout: StoreCheckout;
}

export const stores: readonly Store[] = [
  {
    id: "main",
    title: "Основной склад",
    short: "Основной",
    subtitle: "Метро, самовывоз и доставка по Минску",
    icon: "🏙️",
    spreadsheetId: process.env.GOOGLE_SHEET_ID || "1T3SgqBTTdbUlBjC4UnRKk0G8mbqJK-5RJigP7azr3Rc",
    fallbackTabs: [
      { title: "Жидкости ( salt)", gid: "618442738" },
      { title: "Расходники ", gid: "697847360" },
      { title: "Одноразки", gid: "1156669168" },
      { title: "Снюс", gid: "1228656279" },
      { title: "Пластины", gid: "1565031505" },
      { title: "Поды", gid: "1209278120" },
      { title: "Койла, Вата и др.", gid: "381658474" },
      { title: "Кальяный табак", gid: "942197141" },
      { title: "Напитки", gid: "1286166836" },
      { title: "ОПТ", gid: "1363263078" },
    ],
    checkout: { kind: "full" },
  },
  {
    id: "kamennaya-gorka",
    title: "Каменная Горка",
    short: "Каменная Горка",
    subtitle: "Самовывоз у м. Каменная Горка",
    icon: "📍",
    spreadsheetId: process.env.GOOGLE_SHEET_ID_KG || "1fTaiMEO_YZWP9XLl2aSEXZvGDNRurphBvkzDKKjt-H0",
    fallbackTabs: [
      { title: "Жидкости Salt", gid: "618442738" },
      { title: "Расходники ", gid: "697847360" },
      { title: "Одноразки", gid: "1156669168" },
      { title: "Снюс", gid: "1228656279" },
      { title: "Пластины", gid: "1565031505" },
      { title: "Поды", gid: "1209278120" },
      { title: "Напитки", gid: "312833138" },
      { title: "Койла, Вата и др.", gid: "381658474" },
      { title: "ОПТ", gid: "1363263078" },
    ],
    checkout: { kind: "pickup-only", point: "м. Каменная Горка" },
  },
];

export const DEFAULT_STORE_ID = stores[0].id;

/** Ключ localStorage, где запоминается выбранная точка. */
export const STORE_STORAGE_KEY = "vt:store";

export function getStore(id: string): Store | undefined {
  return stores.find((store) => store.id === id);
}

/** Данные точки, которые можно безопасно отдать в браузер. */
export interface StoreInfo {
  id: string;
  title: string;
  short: string;
  subtitle: string;
  icon: string;
  checkout: StoreCheckout;
}

export function storeInfo({ id, title, short, subtitle, icon, checkout }: Store): StoreInfo {
  return { id, title, short, subtitle, icon, checkout };
}

export const storeInfos: StoreInfo[] = stores.map(storeInfo);

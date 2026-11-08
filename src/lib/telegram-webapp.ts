/*
 * Сайт, открытый внутри Telegram (Mini App, через кнопку бота).
 *
 * Telegram передаёт данные запуска в адресе страницы (#tgWebAppData=…). Только тогда подгружается
 * скрипт Telegram — обычные посетители сайта его не качают.
 */

export interface TelegramWebApp {
  initData: string;
  platform?: string;
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast?(version: string): boolean;
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SCRIPT_URL = "https://telegram.org/js/telegram-web-app.js";
const FLAG = "vt:tg";

/** Открыт ли сайт из Telegram (по данным запуска; после переходов по сайту — по отметке в сессии). */
export function launchedFromTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (/tgWebApp(Data|Platform|Version)=/.test(window.location.hash)) {
    try {
      sessionStorage.setItem(FLAG, "1");
    } catch {
      // приватный режим — не страшно, хватит данных в адресе
    }
    return true;
  }
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

/** Mini App с данными запуска или null, если сайт открыт в обычном браузере. */
export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const app = window.Telegram?.WebApp;
  return app?.initData ? app : null;
}

let loading: Promise<TelegramWebApp | null> | null = null;

/** Подгружает скрипт Telegram (один раз). */
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (telegramWebApp()) return Promise.resolve(telegramWebApp());
  loading ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(telegramWebApp());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}

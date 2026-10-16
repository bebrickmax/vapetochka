import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { productTitle } from "@/lib/products";
import type { Product } from "@/lib/types";

export interface TelegramLink {
  /** Открывает приложение Telegram напрямую. */
  app: string;
  /** Запасная веб-ссылка, если приложение не установлено. */
  web: string;
  /** Чат без готового текста — для компьютеров (см. withoutText). */
  plain: { app: string; web: string };
  /** Готовый текст сообщения, если он есть. */
  text?: string;
}

export function telegramLink(text?: string, username: string = siteConfig.telegramManager): TelegramLink {
  const plain = { app: `tg://resolve?domain=${username}`, web: `https://t.me/${username}` };
  if (!text) return { ...plain, plain };
  const encoded = encodeURIComponent(text);
  return {
    app: `${plain.app}&text=${encoded}`,
    web: `${plain.web}?text=${encoded}`,
    plain,
    text,
  };
}

/**
 * Компьютерные приложения Telegram (macOS и др.) не раскодируют русский текст
 * из ссылки и показывают «%D0%9D%D0%BE…». На компьютере открываем чат без текста,
 * а текст копируем в буфер обмена — его остаётся вставить.
 */
export function isDesktopDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent)) return false;
  // iPad с iPadOS представляется как Mac, но у него есть сенсорный экран.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return false;
  return true;
}

/**
 * iPhone и iPad. Там ссылка https://t.me/… сама открывает приложение Telegram (universal link),
 * а tg:// Safari встречает вопросом «Открыть в Telegram?» — и пока его читают, запасной переход
 * уводит страницу на t.me. Поэтому на iOS — сразу t.me.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1; // iPadOS представляется как Mac
}

export function orderMessage(product: Product): string {
  const title = productTitle(product);
  if (product.status !== "in") {
    return `Здравствуйте! Подскажите, когда будет в наличии: ${title}?`;
  }
  const price = product.price !== null ? ` за ${formatPrice(product.price)}` : "";
  return `Здравствуйте, хочу заказать: ${title}${price}`;
}

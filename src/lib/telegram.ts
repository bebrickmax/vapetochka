import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { productTitle } from "@/lib/products";
import type { Product } from "@/lib/types";

export interface TelegramLink {
  /** Открывает приложение Telegram напрямую. */
  app: string;
  /** Запасная веб-ссылка, если приложение не установлено. */
  web: string;
}

export function telegramLink(text?: string, username: string = siteConfig.telegramManager): TelegramLink {
  const query = text ? `&text=${encodeURIComponent(text)}` : "";
  return {
    app: `tg://resolve?domain=${username}${query}`,
    web: `https://t.me/${username}${text ? `?text=${encodeURIComponent(text)}` : ""}`,
  };
}

export function orderMessage(product: Product): string {
  const title = productTitle(product);
  if (product.status !== "in") {
    return `Здравствуйте! Подскажите, когда будет в наличии: ${title}?`;
  }
  const price = product.price !== null ? ` за ${formatPrice(product.price)}` : "";
  return `Здравствуйте, хочу заказать: ${title}${price}`;
}

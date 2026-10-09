import { siteConfig } from "@/config/site";

export function formatPrice(value: number): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return `${formatted} ${siteConfig.currency}`;
}

export function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: siteConfig.timeZone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function pluralize(count: number, [one, few, many]: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

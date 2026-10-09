import { managerHours } from "@/config/checkout";
import { siteConfig } from "@/config/site";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Минуты с начала суток по времени магазина (Минск). */
export function shopMinutes(now: Date, timeZone: string = siteConfig.timeZone): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Менеджер сейчас на связи (с 11:30 до 21:15 по Минску). */
export function isManagerOnline(now: Date = new Date()): boolean {
  const minutes = shopMinutes(now);
  return minutes >= toMinutes(managerHours.from) && minutes < toMinutes(managerHours.to);
}

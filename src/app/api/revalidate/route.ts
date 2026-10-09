import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { cacheConfig } from "@/config/site";

/**
 * Мгновенное обновление сайта после правки таблицы.
 * Вызывается скриптом Google Apps Script (см. HOW_TO_UPDATE.md) или вручную:
 *   https://ваш-сайт/api/revalidate?secret=ВАШ_СЕКРЕТ
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-revalidate-secret") ?? request.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, message: "Неверный или не настроенный секрет" }, { status: 401 });
  }
  // Сразу помечаем данные устаревшими: следующий посетитель увидит свежую таблицу.
  revalidateTag(cacheConfig.tag, { expire: 0 });
  return Response.json({ ok: true, message: "Каталог обновлён" });
}

export const GET = handle;
export const POST = handle;

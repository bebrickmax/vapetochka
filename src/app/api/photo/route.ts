import { cacheLife } from "next/cache";
import type { NextRequest } from "next/server";
import { getStore } from "@/config/stores";
import { googleImageUrl, imageToken, PHOTO_SIZES, TOKEN_RE } from "@/lib/photos";
import { fetchSheetImages } from "@/lib/sheets/sources";

/*
 * Фото товара из Google Таблицы через сайт:
 *   /api/photo?store=main&gid=618442738&row=71&t=<токен>&s=360
 * Google не отдаёт картинки чужим сайтам напрямую и периодически меняет ссылки,
 * поэтому картинка скачивается здесь и кэшируется браузером и CDN. Если ссылка
 * устарела, по точке, листу и строке находится свежая.
 */

/** Свежие ссылки на фото листа (ссылки Google живут ограниченное время — держим недолго). */
async function freshImages(storeId: string, gid: string): Promise<Record<number, string>> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 1200 });
  const store = getStore(storeId);
  return store ? fetchSheetImages(store, gid) : {};
}

async function download(token: string, size: number): Promise<Response | null> {
  const res = await fetch(googleImageUrl(token, size), { cache: "no-store" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return null;
  return res;
}

const notFound = () => new Response("Фото не найдено", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const storeId = params.get("store") ?? "";
  const gid = params.get("gid") ?? "";
  const row = Number(params.get("row"));
  const token = params.get("t") ?? "";
  const size = Number(params.get("s") ?? 360);

  if (
    !getStore(storeId) ||
    !/^\d{1,12}$/.test(gid) ||
    !Number.isInteger(row) ||
    row < 0 ||
    !TOKEN_RE.test(token) ||
    !PHOTO_SIZES.includes(size as (typeof PHOTO_SIZES)[number])
  ) {
    return notFound();
  }

  let image = await download(token, size);
  let fresh = true;
  if (!image) {
    // Ссылка устарела: берём актуальную для этой строки листа.
    const current = (await freshImages(storeId, gid))[row];
    const currentToken = current ? imageToken(current) : null;
    if (currentToken && currentToken !== token) image = await download(currentToken, size);
    fresh = false;
  }
  if (!image) return notFound();

  return new Response(image.body, {
    headers: {
      "Content-Type": image.headers.get("content-type") ?? "image/png",
      // Адрес с токеном всегда указывает на одну и ту же картинку — её можно кэшировать надолго.
      "Cache-Control": fresh
        ? "public, max-age=604800, s-maxage=2592000, immutable"
        : "public, max-age=3600, s-maxage=3600",
    },
  });
}

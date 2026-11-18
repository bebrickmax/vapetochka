import { cacheLife } from "next/cache";
import type { NextRequest } from "next/server";
import { getStore } from "@/config/stores";
import { publicPhotoPrefix } from "@/lib/db/supabase";
import { googleImageUrl, imageToken, isStoragePhoto, PHOTO_SIZES, ROW_KEY_RE, TOKEN_RE } from "@/lib/photos";
import { fetchSheetImages } from "@/lib/sheets/sources";

/*
 * Фото товара через сайт.
 *
 * Из Google Таблицы:
 *   /api/photo?store=main&gid=618442738&row=71&k=<отпечаток строки>&s=360
 * Google не отдаёт картинки чужим сайтам напрямую и меняет ссылки на них каждые несколько секунд,
 * поэтому в адресе не ссылка, а место фото в таблице (точка, лист, строка) и отпечаток строки:
 * адрес не меняется, пока не изменилась сама строка, и CDN отдаёт фото, не запуская сайт.
 * Свежую ссылку Google сайт находит сам по точке, листу и строке.
 *   /api/photo?…&t=<токен>&s=360 — прежние адреса (страницы, собранные до обновления).
 *
 * Из хранилища Supabase (импорт, фото с телефона):
 *   /api/photo?u=<публичная ссылка на фото>&s=360
 * Картинка уменьшается до нужного размера (JPEG на белом фоне — карточки белые) и кэшируется
 * на CDN навсегда: имя файла в хранилище не меняется для другого фото.
 */

/** Свежие ссылки на фото листа (ссылки Google живут ограниченное время — держим недолго). */
async function freshImages(storeId: string, gid: string): Promise<Record<number, string>> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 1200 });
  const store = getStore(storeId);
  return store ? fetchSheetImages(store, gid) : {};
}

/**
 * То же, но одновременные запросы одного листа ждут одну загрузку: покупатель открыл вкладку —
 * браузер разом просит десятки фото, а веб-просмотр листа нужно скачать и разобрать один раз.
 */
const pending = new Map<string, Promise<Record<number, string>>>();
function sheetImages(storeId: string, gid: string): Promise<Record<number, string>> {
  const key = `${storeId}:${gid}`;
  let images = pending.get(key);
  if (!images) {
    images = freshImages(storeId, gid).finally(() => pending.delete(key));
    pending.set(key, images);
  }
  return images;
}

async function download(token: string, size: number): Promise<Response | null> {
  const res = await fetch(googleImageUrl(token, size), { cache: "no-store" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return null;
  return res;
}

const notFound = () => new Response("Фото не найдено", { status: 404, headers: { "Cache-Control": "no-store" } });

const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

/**
 * Фото таблицы по постоянному адресу: CDN и браузер хранят сутки. Изменилась строка таблицы — у фото новый
 * адрес, оно обновится сразу; фото заменили, а текст строки тот же — обновится в течение суток.
 * У Google нет постоянного номера картинки, поэтому дольше держать нельзя, а чаще — дорого.
 */
const SHEET_PHOTO = "public, max-age=86400, s-maxage=86400";

/** Фото из таблицы по месту: точка, лист, строка. */
async function sheetPhoto(storeId: string, gid: string, row: number, size: number): Promise<Response> {
  const tokenAt = (images: Record<number, string>) => (images[row] ? imageToken(images[row]) : null);
  let token = tokenAt(await sheetImages(storeId, gid));
  let image = token ? await download(token, size) : null;
  if (!image) {
    // Ссылка из памяти устарела (или фото только что вставили) — спрашиваем Google заново.
    const store = getStore(storeId);
    token = store ? tokenAt(await fetchSheetImages(store, gid)) : null;
    image = token ? await download(token, size) : null;
  }
  if (!image) return notFound();
  return new Response(image.body, {
    headers: { "Content-Type": image.headers.get("content-type") ?? "image/png", "Cache-Control": SHEET_PHOTO },
  });
}

/** Фото из хранилища, уменьшенное до size по длинной стороне. */
async function storagePhoto(url: string, size: number): Promise<Response> {
  const prefix = publicPhotoPrefix();
  // Фото другого проекта Supabase — не уменьшаем, просто отправляем туда.
  if (!prefix || !url.startsWith(prefix)) return Response.redirect(url, 307);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/")) return notFound();
  const original = Buffer.from(await res.arrayBuffer());

  try {
    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(original, { failOn: "none", limitInputPixels: 80_000_000 })
      .rotate() // по EXIF — фото с телефона не лягут набок
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: size >= 1200 ? 85 : 80, mozjpeg: true })
      .toBuffer();
    return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": IMMUTABLE } });
  } catch (error) {
    // Не получилось уменьшить — отдаём как есть, лишь бы фото было.
    console.error("[photo] Не удалось уменьшить фото:", error);
    return new Response(new Uint8Array(original), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const size = Number(params.get("s") ?? 360);
  const sizeOk = PHOTO_SIZES.includes(size as (typeof PHOTO_SIZES)[number]);

  const storage = params.get("u");
  if (storage !== null) return sizeOk && isStoragePhoto(storage) ? storagePhoto(storage, size) : notFound();

  const storeId = params.get("store") ?? "";
  const gid = params.get("gid") ?? "";
  const row = Number(params.get("row"));
  const key = params.get("k");
  const token = params.get("t") ?? "";

  if (!getStore(storeId) || !/^\d{1,12}$/.test(gid) || !Number.isInteger(row) || row < 0 || !sizeOk) return notFound();
  if (key !== null) return ROW_KEY_RE.test(key) ? sheetPhoto(storeId, gid, row, size) : notFound();
  if (!TOKEN_RE.test(token)) return notFound();

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

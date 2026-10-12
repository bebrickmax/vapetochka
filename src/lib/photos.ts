/*
 * Фото из Google Таблицы нельзя вставлять на сайт напрямую: Google отдаёт их
 * только своим страницам (Cross-Origin-Resource-Policy: same-site), а ссылки
 * на картинки живут ограниченное время. Поэтому сайт показывает фото через
 * свой адрес /api/photo, который забирает картинку у Google и кэширует её.
 */

const GOOGLE_IMAGE_RE = /\/sheets-images-rt\/([A-Za-z0-9_-]{20,600})$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{20,600}$/;

/** Разрешённые размеры (по длинной стороне), чтобы адреса кэшировались хорошо. */
export const PHOTO_SIZES = [160, 360, 1200] as const;

/** Токен картинки из адреса Google (…/sheets-images-rt/<токен>). */
export function imageToken(googleUrl: string): string | null {
  return googleUrl.match(GOOGLE_IMAGE_RE)?.[1] ?? null;
}

export function googleImageUrl(token: string, size: number): string {
  return `https://docs.google.com/sheets-images-rt/${token}=s${size}`;
}

/** Адрес фото на сайте: точка, лист и строка нужны, чтобы найти свежую ссылку, если старая устарела. */
export function photoPath(storeId: string, gid: string, row: number, googleUrl: string): string | null {
  const token = imageToken(googleUrl);
  if (!token) return null;
  const params = new URLSearchParams({ store: storeId, gid, row: String(row), t: token });
  return `/api/photo?${params}`;
}

/** Фото листа с адресами сайта вместо адресов Google. */
export function proxyImages(
  storeId: string,
  gid: string | undefined,
  images: Record<number, string> | undefined,
): Record<number, string> {
  if (!gid || !images) return {};
  const result: Record<number, string> = {};
  for (const [row, url] of Object.entries(images)) {
    const path = photoPath(storeId, gid, Number(row), url);
    if (path) result[Number(row)] = path;
  }
  return result;
}

/** Адрес фото нужного размера. */
export function sizedPhoto(url: string, size: number): string {
  const allowed = PHOTO_SIZES.find((s) => s >= size) ?? PHOTO_SIZES[PHOTO_SIZES.length - 1];
  if (url.startsWith("/api/photo")) return `${url}&s=${allowed}`;
  return `${url}=s${allowed}`;
}

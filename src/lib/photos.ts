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

/** Отпечаток строки в адресе фото: латиница в нижнем регистре и цифры. */
export const ROW_KEY_RE = /^[0-9a-z]{1,13}$/;

/**
 * Короткий отпечаток строки таблицы (FNV-1a): меняется вместе со строкой. Входит в адрес фото вместо
 * токена Google — тот меняется сам каждые несколько секунд (проверено: ~40% картинок листа за 10 секунд),
 * и с токеном в адресе после каждой пересборки витрины покупатели заново качали фото через сайт.
 */
export function rowKey(cells: readonly string[] | undefined): string {
  const text = JSON.stringify(cells ?? []);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Постоянный адрес фото на сайте: точка, лист, строка и отпечаток строки. Свежую ссылку Google на
 * картинку сайт находит сам по точке, листу и строке (/api/photo), а CDN хранит фото по этому адресу.
 */
export function photoPath(storeId: string, gid: string, row: number, key: string): string {
  const params = new URLSearchParams({ store: storeId, gid, row: String(row), k: key });
  return `/api/photo?${params}`;
}

/** Фото листа с адресами сайта вместо адресов Google. rows — строки листа (для отпечатков). */
export function proxyImages(
  storeId: string,
  gid: string | undefined,
  images: Record<number, string> | undefined,
  rows?: readonly (readonly string[])[],
): Record<number, string> {
  if (!gid || !images) return {};
  const result: Record<number, string> = {};
  for (const [row, url] of Object.entries(images)) {
    if (!imageToken(url)) continue; // не картинка Google
    result[Number(row)] = photoPath(storeId, gid, Number(row), rowKey(rows?.[Number(row)]));
  }
  return result;
}

/** Фото из хранилища Supabase (публичный бакет photos): https://<проект>.supabase.co/storage/v1/object/public/photos/… */
const STORAGE_PHOTO_RE = /^https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\/photos\/[A-Za-z0-9/._-]+$/;
export const isStoragePhoto = (url: string) => STORAGE_PHOTO_RE.test(url);

/**
 * Адрес фото нужного размера. Фото из хранилища (импорт из таблицы — 1200 px, фото с телефона)
 * тоже идут через /api/photo: сайт уменьшает их до размера карточки и кэширует на CDN, иначе
 * телефон качал бы полноразмерные картинки на каждую карточку (медленно, тяжело для памяти айфона).
 */
export function sizedPhoto(url: string, size: number): string {
  const allowed = PHOTO_SIZES.find((s) => s >= size) ?? PHOTO_SIZES[PHOTO_SIZES.length - 1];
  if (url.startsWith("/api/photo")) return `${url}&s=${allowed}`;
  if (url.includes("/sheets-images-rt/")) return `${url}=s${allowed}`;
  if (isStoragePhoto(url)) return `/api/photo?${new URLSearchParams({ u: url, s: String(allowed) })}`;
  return url; // внешняя ссылка — как есть
}

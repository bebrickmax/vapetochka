/*
 * Фото с телефона перед загрузкой уменьшается прямо в браузере: снимок айфона весит 3–10 МБ,
 * а Vercel принимает не больше 4,5 МБ за запрос. Длинная сторона — до 1600 px, JPEG на белом
 * фоне (карточки на сайте белые) — обычно 200–500 КБ.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.85;
/** Уже маленькие JPEG/WebP не пережимаем. */
const SMALL_ENOUGH = 1.5 * 1024 * 1024;
/** Сколько примет сервер (запас под multipart до лимита Vercel 4,5 МБ). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть фото"));
    };
    img.src = url;
  });
}

/** Уменьшенная копия фото для загрузки. Если браузер не смог открыть файл — возвращает его как есть. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  if (scale === 1 && file.size <= SMALL_ENOUGH && (file.type === "image/jpeg" || file.type === "image/webp")) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  return blob && blob.size < file.size ? blob : file;
}

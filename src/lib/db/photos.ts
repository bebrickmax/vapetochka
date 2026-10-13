import { imageToken } from "@/lib/photos";
import { uploadPhoto } from "./supabase";

/*
 * Фото из Google Таблицы → постоянное хранилище Supabase (ссылки Google со временем перестают работать).
 */

const CONCURRENCY = 6;

export async function copyPhoto(url: string): Promise<string | null> {
  const token = imageToken(url);
  if (!token) return url.startsWith("https://") ? url : null; // уже постоянная ссылка
  try {
    const res = await fetch(`https://docs.google.com/sheets-images-rt/${token}=s1200`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const name = `import/${token.slice(-24)}.${ext}`;
    return await uploadPhoto(name, await res.arrayBuffer(), type);
  } catch {
    return null;
  }
}

/** Копирует фото из таблицы в хранилище; возвращает «старая ссылка → новая». */
export async function copyPhotos(urls: string[]): Promise<{ map: Map<string, string>; failed: number }> {
  const unique = [...new Set(urls)];
  const map = new Map<string, string>();
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      const copied = await copyPhoto(url);
      if (copied) map.set(url, copied);
      else failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return { map, failed };
}


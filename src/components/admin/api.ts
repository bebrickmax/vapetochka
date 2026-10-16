/** Запросы админки к своему API. Ошибки — с понятным текстом из ответа сервера. */

import { MAX_UPLOAD_BYTES, shrinkPhoto } from "./shrink";

export class UnauthorizedError extends Error {}

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new UnauthorizedError(data.error ?? "Нужно войти");
  if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
  return data;
}

/** Загрузка фото в хранилище (сначала уменьшается в браузере) — возвращает ссылку. */
export async function uploadPhoto(file: File): Promise<string> {
  const photo = await shrinkPhoto(file);
  if (photo.size > MAX_UPLOAD_BYTES) throw new Error("Фото больше 4 МБ и не уменьшилось — выберите другое или сделайте скриншот");
  const form = new FormData();
  form.append("file", photo, photo === file ? file.name : "photo.jpg");
  const { url } = await api<{ url: string }>("/api/admin/upload", { form });
  return url;
}

/** Запросы админки к своему API. Ошибки — с понятным текстом из ответа сервера. */

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

/** Загрузка фото в хранилище — возвращает ссылку. */
export async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { url } = await api<{ url: string }>("/api/admin/upload", { form });
  return url;
}

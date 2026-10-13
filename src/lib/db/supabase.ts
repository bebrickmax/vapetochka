/*
 * Минимальный клиент Supabase поверх REST (PostgREST + Storage) — без npm-пакетов.
 * Работает ТОЛЬКО на сервере: использует service_role-ключ, который обходит RLS.
 * Никогда не импортируйте этот файл в клиентские компоненты.
 */

const PAGE = 1000; // Supabase по умолчанию отдаёт не больше 1000 строк за запрос

function env() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { url, key };
}

/** База подключена (заданы адрес и ключ). Без них сайт работает от Google Таблиц. */
export function isDbConfigured(): boolean {
  const { url, key } = env();
  return !!url && !!key;
}

export class DbError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const { key } = env();
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const { url } = env();
  if (!isDbConfigured()) throw new DbError("База данных не подключена (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)", 503);
  const res = await fetch(`${url}${path}`, { ...init, headers: headers(init.headers), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DbError(`Supabase ${res.status}: ${body.slice(0, 400)}`, res.status);
  }
  return res;
}

/** Значение для фильтра PostgREST: in.(a,b) с экранированием. */
export function inList(values: readonly string[]): string {
  return `in.(${values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")})`;
}

type Query = Record<string, string | number | undefined>;

function qs(query: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** SELECT всех строк таблицы с постраничной подгрузкой. */
export async function selectAll<T>(table: string, query: Query = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await request(`/rest/v1/${table}${qs({ select: "*", ...query })}`, {
      headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE - 1}` },
    });
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** INSERT (или UPSERT при onConflict). Возвращает вставленные строки. */
export async function insert<T>(
  table: string,
  rows: object | object[],
  options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
): Promise<T[]> {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return [];
  const prefer = ["return=representation"];
  if (options.onConflict) prefer.push(options.ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates");
  const res = await request(`/rest/v1/${table}${qs({ on_conflict: options.onConflict })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: prefer.join(",") },
    body: JSON.stringify(list),
  });
  return (await res.json()) as T[];
}

/** UPDATE по фильтру PostgREST, например { id: "eq.123" }. */
export async function update<T>(table: string, filter: Query, values: object): Promise<T[]> {
  const res = await request(`/rest/v1/${table}${qs(filter)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(values),
  });
  return (await res.json()) as T[];
}

/** DELETE по фильтру. Пустой фильтр запрещён — чтобы случайно не очистить таблицу. */
export async function remove(table: string, filter: Query): Promise<void> {
  if (Object.keys(filter).length === 0) throw new Error("remove() без фильтра запрещён");
  await request(`/rest/v1/${table}${qs(filter)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

// ─── Storage ────────────────────────────────────────────────────────────────

export const PHOTO_BUCKET = "photos";

/** Загружает файл в публичный бакет и возвращает его постоянную ссылку. */
export async function uploadPhoto(path: string, body: Blob | ArrayBuffer, contentType: string): Promise<string> {
  const safe = path.replace(/[^a-zA-Z0-9/._-]/g, "_");
  await request(`/storage/v1/object/${PHOTO_BUCKET}/${safe}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "max-age=31536000" },
    body,
  });
  return `${env().url}/storage/v1/object/public/${PHOTO_BUCKET}/${safe}`;
}

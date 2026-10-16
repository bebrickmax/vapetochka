import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { cacheConfig } from "@/config/site";
import { stores } from "@/config/stores";
import { DbError } from "@/lib/db/supabase";
import { isAuthorized } from "./auth";

/** Ошибка с понятным сообщением для админки. */
export class AdminError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Сразу после ответа сам открывает страницы точек: они отдаются из кэша, а свежая
 * версия собирается в фоне — через несколько секунд её видят все, и никто не ждёт.
 */
export function warmStorefront(request: Request) {
  const origin = new URL(request.url).origin;
  after(async () => {
    // Сброс кэша Next применяет, когда обработчик уже ответил, — даём ему секунду, чтобы страница
    // точно считалась устаревшей и пересобралась, а не отдалась из кэша как свежая.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await Promise.allSettled(
      stores.map((store) => fetch(`${origin}/${store.id}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) })),
    );
  });
}

/**
 * Помечает витрину устаревшей после правки в админке. Не `{ expire: 0 }`: тогда первый покупатель
 * после каждой правки ждал бы, пока заново прочитаются база и таблица (несколько секунд пустого экрана).
 */
export function refreshStorefront(request: Request) {
  revalidateTag(cacheConfig.tag, "max");
  revalidateTag(cacheConfig.settingsTag, "max");
  warmStorefront(request);
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Обёртка роута админки: проверка входа, разбор ошибок, сброс кэша после изменений. */
export function adminRoute<C>(handler: Handler<C>, { mutates = true } = {}): Handler<C> {
  return async (request, context) => {
    if (!isAuthorized(request)) return json({ error: "Нужно войти в админку" }, 401);
    try {
      const response = await handler(request, context);
      if (mutates && response.ok) refreshStorefront(request);
      return response;
    } catch (error) {
      if (error instanceof AdminError) return json({ error: error.message }, error.status);
      if (error instanceof DbError) {
        console.error("[admin] Supabase:", error.message);
        return json({ error: error.status === 503 ? error.message : "База данных не ответила. Попробуйте ещё раз." }, 502);
      }
      console.error("[admin]", error);
      return json({ error: "Что-то пошло не так. Попробуйте ещё раз." }, 500);
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AdminError("Неверный запрос");
  }
}

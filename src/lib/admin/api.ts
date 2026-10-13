import { revalidateTag } from "next/cache";
import { cacheConfig } from "@/config/site";
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

/** Сбрасывает кэш витрины: следующий посетитель сразу получит свежие данные. */
export function refreshStorefront() {
  revalidateTag(cacheConfig.tag, { expire: 0 });
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Обёртка роута админки: проверка входа, разбор ошибок, сброс кэша после изменений. */
export function adminRoute<C>(handler: Handler<C>, { mutates = true } = {}): Handler<C> {
  return async (request, context) => {
    if (!isAuthorized(request)) return json({ error: "Нужно войти в админку" }, 401);
    try {
      const response = await handler(request, context);
      if (mutates && response.ok) refreshStorefront();
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

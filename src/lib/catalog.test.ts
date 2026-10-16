import { afterEach, describe, expect, it, vi } from "vitest";
import { getCatalog } from "./catalog";

// Вне Next.js кэш-функции не работают — здесь они не нужны, проверяем только логику выбора источника.
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {}, revalidateTag: () => {}, updateTag: () => {} }));

/*
 * Витрина при сбоях базы: вместо отката на Google Таблицу — ошибка, после которой Vercel (ISR)
 * оставляет последнюю удачную страницу точки.
 */

type Route = (url: URL) => Response | undefined;
const realFetch = globalThis.fetch;
const googleRequests: string[] = [];

function serve(route: Route) {
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname !== "fake.supabase.co") {
      googleRequests.push(url.hostname);
      return new Response("nope", { status: 500 });
    }
    return route(url) ?? Response.json([]);
  }) as typeof fetch;
}

const table = (url: URL) => url.pathname.replace("/rest/v1/", "");
/** Настройки точек читаются нормально (и проверка схемы тоже), остальное решает тест. */
const settings = (source: "db" | "sheet") => (url: URL) => {
  if (table(url) === "store_settings" && url.searchParams.get("select")?.includes("source"))
    return Response.json([{ store_id: "main", source, synced_at: "2026-10-16T10:00:00Z", sync_lock: null }]);
  if (table(url) === "item_stock" && url.searchParams.get("limit") === "1") return Response.json([]);
  return undefined;
};

const message = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

afterEach(() => {
  globalThis.fetch = realFetch;
  googleRequests.length = 0;
});

describe("витрина, когда база не отвечает", () => {
  it("«от админки»: база упала — ошибка (останется прошлая витрина), таблицу не читаем", async () => {
    serve((url) => settings("db")(url) ?? new Response(JSON.stringify({ message: "down" }), { status: 503 }));
    expect(await message(getCatalog("main"))).toMatch(/база не отвечает/);
    expect(googleRequests).toEqual([]);
  });

  it("«от админки»: в базе пусто — тоже ошибка, а не старая таблица", async () => {
    serve(settings("db"));
    expect(await message(getCatalog("main"))).toMatch(/нет её товаров/);
    expect(googleRequests).toEqual([]);
  });

  it("настройки точек не прочитались — ошибка, режим не угадываем", async () => {
    serve(() => new Response(JSON.stringify({ message: "down" }), { status: 503 }));
    expect(await message(getCatalog("main"))).toMatch(/настройки точек не прочитались/);
    expect(googleRequests).toEqual([]);
  });

  it("«от таблицы»: база упала после синхронизации — ошибка, а не таблица без правок админки", async () => {
    let snapshotReads = 0;
    serve((url) => {
      const fromSettings = settings("sheet")(url);
      if (fromSettings) return fromSettings;
      if (table(url) === "store_settings") return Response.json([]); // блокировка синхронизации
      snapshotReads++;
      return new Response(JSON.stringify({ message: "down" }), { status: 503 });
    });
    expect(await message(getCatalog("main"))).toMatch(/база не отвечает/);
    expect(snapshotReads).toBeGreaterThan(0);
  });
});

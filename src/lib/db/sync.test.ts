import { describe, expect, it } from "vitest";
import { createProducts, deleteItem, updateItem, updateLine } from "@/lib/admin/mutations";
import type { RawSheet } from "@/lib/types";
import { catalogFromSnapshot } from "./catalog";
import { categoriesFromSheets, importCategories } from "./import";
import { syncFromSheets } from "./sync";
import type { DbSnapshot } from "./types";

/** Поддельная Supabase в памяти: фильтры eq/in/is/not.is, upsert по on_conflict, PATCH, DELETE. */
function fakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    categories: [],
    product_lines: [],
    items: [],
    item_stock: [],
    store_settings: [],
  };
  let seq = 0;
  const parseIn = (v: string) => v.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, ""));
  const test = (row: Record<string, unknown>, key: string, cond: string) => {
    const value = row[key];
    if (cond.startsWith("eq.")) return String(value) === cond.slice(3);
    if (cond.startsWith("in.")) return parseIn(cond).includes(String(value));
    if (cond === "is.null") return value === null || value === undefined;
    if (cond === "not.is.null") return value !== null && value !== undefined;
    throw new Error(`unsupported filter ${key}=${cond}`);
  };
  const reserved = ["select", "order", "on_conflict", "limit"];
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.replace("/rest/v1/", "");
    const method = init.method ?? "GET";
    const rows = tables[table];
    if (!rows) return new Response(JSON.stringify({ message: "no table" }), { status: 404 });
    const filters = [...url.searchParams].filter(([k]) => !reserved.includes(k));
    const match = (row: Record<string, unknown>) => filters.every(([k, v]) => test(row, k, v));
    if (method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? Infinity);
      return Response.json(rows.filter(match).slice(0, limit));
    }
    if (method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>[];
      const conflict = url.searchParams.get("on_conflict")?.split(",");
      const ignore = String((init.headers as Record<string, string>)?.Prefer ?? "").includes("ignore-duplicates");
      const out: Record<string, unknown>[] = [];
      for (const r of body) {
        const existing = conflict && rows.find((x) => conflict.every((c) => String(x[c]) === String(r[c])));
        if (existing) {
          if (!ignore) Object.assign(existing, r);
          out.push(existing);
          continue;
        }
        const row = {
          ...(table === "product_lines" || table === "items" ? { id: `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}` } : {}),
          ...r,
        };
        rows.push(row);
        out.push(row);
      }
      return Response.json(out, { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      const hit = rows.filter(match);
      hit.forEach((r) => Object.assign(r, patch));
      return Response.json(hit);
    }
    if (method === "DELETE") {
      tables[table] = rows.filter((r) => !match(r));
      if (table === "items") {
        const ids = new Set(tables.items.map((i) => i.id));
        tables.item_stock = tables.item_stock.filter((s) => ids.has(s.item_id));
      }
      if (table === "product_lines") {
        const ids = new Set(tables.product_lines.map((l) => l.id));
        tables.items = tables.items.filter((i) => ids.has(i.line_id));
      }
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const snapshot = () =>
    ({ categories: tables.categories, lines: tables.product_lines, items: tables.items, stock: tables.item_stock }) as unknown as DbSnapshot;
  return {
    tables,
    snapshot,
    /** Отметить, что первая синхронизация точки прошла. */
    synced: (storeId: string) => {
      const row = tables.store_settings.find((r) => r.store_id === storeId);
      if (row) row.synced_at = "2026-10-13T10:00:00Z";
      else tables.store_settings.push({ store_id: storeId, source: "sheet", synced_at: "2026-10-13T10:00:00Z", sync_lock: null });
    },
    stock: (storeId: string, title: string) => {
      const item = tables.items.find((i) => String(i.title).includes(title));
      return tables.item_stock.find((s) => s.store_id === storeId && s.item_id === item?.id);
    },
  };
}

const sheet = (title: string, rows: string[][]): RawSheet => ({ title, rows });
const failure = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const liquids = (lines: [string, string, [string, string][]][]) =>
  sheet(
    "Жидкости",
    lines.flatMap(([line, price, items]) => [[line], [price], ...items.map(([name, mark]) => ["", name, mark])]),
  );
const shown = (db: ReturnType<typeof fakeSupabase>, storeId: string) =>
  catalogFromSnapshot(db.snapshot(), storeId).groups.map((g) => [g.line, g.items.map((i) => `${i.name}:${i.price}:${i.status}`)]);

describe("sync: Google Sheet → database mirror", () => {
  it("adopts an old import, keeps admin edits until the sheet changes, adds and removes products", async () => {
    const db = fakeSupabase();

    // Старый перенос из таблицы (до зеркала): в нём есть вкус, которого в таблице уже нет.
    await importCategories(
      "main",
      categoriesFromSheets([liquids([["Рик 50mg", "15 BYN", [["🍌Банан", "✅"], ["🍉Арбуз", "✅"], ["🥥Кокос", "✅"]]]])]),
    );
    const linesBefore = db.tables.product_lines.length;

    // 1. Первая синхронизация узнаёт старые строки, а лишнее убирает.
    const v1 = { sheets: [liquids([["Рик 50mg", "15 BYN", [["🍌Банан", "✅"], ["🍉Арбуз", "✅"]]], ["Мята 20mg", "12 BYN", [["Мята", "✅"]]]])] };
    const r1 = await syncFromSheets("main", v1);
    expect(r1.report.first).toBe(true);
    expect(db.tables.product_lines.length).toBe(linesBefore + 1); // «Рик» узнан, «Мята» новая
    expect(r1.report.items.created).toBe(1);
    expect(r1.report.stock.removed).toBe(1); // Кокос
    expect(db.tables.items.some((i) => String(i.title).includes("Кокос"))).toBe(false);
    expect(shown(db, "main")).toEqual([
      ["Рик 50mg", ["Банан:15:in", "Арбуз:15:in"]],
      ["Мята 20mg", ["Мята:12:in"]],
    ]);
    db.synced("main");

    // 2. Правки в админке: Банан закончился, Арбуз за 17.
    Object.assign(db.stock("main", "Банан")!, { in_stock: false });
    Object.assign(db.stock("main", "Арбуз")!, { price: 17 });

    // 3. Админка добавляет вкус в линейку из таблицы — он встаёт по алфавиту, порядок таблицы не трогается.
    const rick = db.tables.product_lines.find((l) => l.name === "Рик 50mg")!;
    await createProducts({ lineId: String(rick.id), titles: ["🍑Абрикос"], stores: ["main"], price: 15 });

    // Позицию из таблицы нельзя переименовать или удалить в админке, пока точка «от таблицы».
    const banana = db.tables.items.find((i) => String(i.title).includes("Банан"))!;
    expect(await failure(() => updateItem(String(banana.id), { title: "Банан 2" }))).toMatch(/таблиц/);
    expect(await failure(() => deleteItem(String(banana.id)))).toMatch(/таблиц/);
    await updateItem(String(banana.id), { imageUrl: "https://cdn.example/banana.jpg" }); // фото — можно

    // 4. Таблица: Банан не трогали, цену линейки подняли до 16, добавили Вишню, «Мяту» убрали.
    const v2 = { sheets: [liquids([["Рик 50mg", "16 BYN", [["🍌Банан", "✅"], ["🍉Арбуз", "✅"], ["🍒Вишня", "✅"]]]])] };
    const r2 = await syncFromSheets("main", v2);
    expect(r2.report.items.created).toBe(1); // Вишня
    expect(shown(db, "main")).toEqual([["Рик 50mg", ["Абрикос:15:in", "Банан:16:out", "Арбуз:16:in", "Вишня:16:in"]]]);
    expect(db.tables.product_lines.some((l) => l.name === "Мята 20mg")).toBe(false);

    // 5. В таблице поставили Банану ❌, потом снова ✅ — таблица меняла клетку, значит она и права.
    const v3 = { sheets: [liquids([["Рик 50mg", "16 BYN", [["🍌Банан", "❌"], ["🍉Арбуз", "✅"], ["🍒Вишня", "✅"]]]])] };
    await syncFromSheets("main", v3);
    await syncFromSheets("main", v2);
    expect(shown(db, "main")[0][1]).toContain("Банан:16:in");
    expect(db.tables.items.find((i) => String(i.title).includes("Банан"))!.image_url).toBe("https://cdn.example/banana.jpg");

    // 6. Каменная Горка: те же линейки — общие позиции, своё наличие; порядок задаёт «Общий прайс».
    const kg = { sheets: [liquids([["Рик 50mg", "14 BYN", [["🍒Вишня", "✅"], ["🍌Банан", "❌"]]]])] };
    const rk = await syncFromSheets("kamennaya-gorka", kg);
    expect(rk.report.lines.created).toBe(0);
    expect(rk.report.items.created).toBe(0);
    expect(shown(db, "kamennaya-gorka")).toEqual([["Рик 50mg", ["Банан:14:out", "Вишня:14:in"]]]);

    // 7. Ничего не поменялось — синхронизация ничего не пишет.
    const again = await syncFromSheets("main", v2);
    expect(again.report.changed).toBe(false);
  });

  it("only-new and replace modes (point works from the admin)", async () => {
    const db = fakeSupabase();
    const v1 = { sheets: [liquids([["Рик 50mg", "15 BYN", [["🍌Банан", "✅"]]]])] };
    await syncFromSheets("main", v1);
    db.synced("main");
    db.tables.store_settings[0].source = "db";
    Object.assign(db.stock("main", "Банан")!, { in_stock: false, price: 20 });

    const v2 = { sheets: [liquids([["Рик 50mg", "15 BYN", [["🍌Банан", "✅"], ["🍒Вишня", "✅"]]]])] };
    await syncFromSheets("main", v2, { onlyNew: true });
    expect(shown(db, "main")).toEqual([["Рик 50mg", ["Банан:20:out", "Вишня:15:in"]]]);

    await syncFromSheets("main", v2, { force: true });
    expect(shown(db, "main")).toEqual([["Рик 50mg", ["Банан:15:in", "Вишня:15:in"]]]);
  });

  it("does not wipe the store when the sheet comes back suspiciously short", async () => {
    const db = fakeSupabase();
    const many = Array.from({ length: 30 }, (_, i) => [`Вкус ${i + 1}`, "✅"] as [string, string]);
    await syncFromSheets("main", { sheets: [liquids([["Рик 50mg", "15 BYN", many]])] });
    db.synced("main");
    const r = await syncFromSheets("main", { sheets: [liquids([["Рик 50mg", "15 BYN", many.slice(0, 3)]])] });
    expect(r.report.stock.removalSkipped).toBe(true);
    expect(catalogFromSnapshot(db.snapshot(), "main").groups[0].items).toHaveLength(30);
  });

  it("keeps «Новинка» marks from the admin through syncs with the sheet", async () => {
    const db = fakeSupabase();
    const v1 = { sheets: [liquids([["Рик 50mg", "15 BYN", [["🍌Банан", "✅"]]]])] };
    await syncFromSheets("main", v1);
    db.synced("main");

    // Линейку из таблицы можно отметить новинкой, даже пока точка «от таблицы».
    const rick = db.tables.product_lines.find((l) => l.name === "Рик 50mg")!;
    await updateLine(String(rick.id), { isNew: true });
    // Новый вкус в существующую линейку — сразу с меткой.
    const { items } = await createProducts({ lineId: String(rick.id), titles: ["🍒Вишня"], stores: ["main"], price: 15, isNew: true });
    expect(items[0].is_new).toBe(true);
    // Новая линейка с меткой: метка на линейке, не на каждом вкусе.
    const mint = await createProducts({ line: { categoryId: "liquids", name: "Мята 20mg" }, titles: ["Мята"], stores: ["main"], price: 12, isNew: true });
    expect(mint.line.is_new).toBe(true);
    expect(mint.items[0].is_new).toBeUndefined();

    // Таблица поменяла цену — синхронизация метки не трогает.
    await syncFromSheets("main", { sheets: [liquids([["Рик 50mg", "16 BYN", [["🍌Банан", "✅"]]]])] });
    const groups = catalogFromSnapshot(db.snapshot(), "main").groups;
    const rickGroup = groups.find((g) => g.line === "Рик 50mg")!;
    expect(rickGroup.isNew).toBe(true);
    expect(rickGroup.items.find((i) => i.name === "Вишня")?.isNew).toBe(true);
    expect(groups.find((g) => g.line === "Мята 20mg")?.isNew).toBe(true);

    await updateLine(String(rick.id), { isNew: false });
    expect(catalogFromSnapshot(db.snapshot(), "main").groups.find((g) => g.line === "Рик 50mg")?.isNew).toBeUndefined();
  });

  it("removes nothing when the sheet list came from the fallback", async () => {
    const db = fakeSupabase();
    const both = [liquids([["Рик 50mg", "15 BYN", [["🍌Банан", "✅"]]]]), sheet("Снюс", [["Drymost 75mg"], ["10 BYN"], ["", "Mint", "✅"]])];
    await syncFromSheets("main", { sheets: both });
    db.synced("main");
    // Google не отдал список листов — в запасном нет «Снюса».
    const r = await syncFromSheets("main", { sheets: [both[0]], partial: true });
    expect(r.report.stock).toMatchObject({ removed: 0, removalSkipped: true, skipReason: "partial" });
    expect(catalogFromSnapshot(db.snapshot(), "main").groups.map((g) => g.line)).toEqual(["Рик 50mg", "Drymost 75mg"]);
  });
});

import { describe, expect, it } from "vitest";
import { catalogFromSnapshot } from "./catalog";
import { categoriesFromSheets, categoryFromCsv, importCategories, itemTitle } from "./import";
import type { DbSnapshot } from "./types";

/** Поддельная Supabase в памяти: понимает ровно те запросы, что делает импорт. */
function fakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = { categories: [], product_lines: [], items: [], item_stock: [] };
  let seq = 0;
  const parseIn = (v: string) => v.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, ""));
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.replace("/rest/v1/", "");
    const method = init.method ?? "GET";
    const rows = tables[table];
    const filters = [...url.searchParams].filter(([k]) => !["select", "order", "on_conflict", "limit"].includes(k));
    const match = (row: Record<string, unknown>) =>
      filters.every(([k, v]) => (v.startsWith("in.") ? parseIn(v).includes(String(row[k])) : String(row[k]) === v.slice(3)));
    if (method === "GET") return Response.json(rows.filter(match));
    if (method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>[];
      const added = body
        .filter((r) => !(table === "categories" && rows.some((x) => x.id === r.id)))
        .map((r) => ({ ...(table === "product_lines" || table === "items" ? { id: `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}` } : {}), ...r }));
      rows.push(...added);
      return Response.json(added, { status: 201 });
    }
    if (method === "DELETE") {
      tables[table] = rows.filter((r) => !match(r));
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  return {
    snapshot: () =>
      ({
        categories: tables.categories,
        lines: tables.product_lines,
        items: tables.items,
        stock: tables.item_stock,
      }) as unknown as DbSnapshot,
  };
}

const sheet = (title: string, rows: string[][]) => ({ title, rows });

describe("import", () => {
  it("restores the item text as in the sheet", () => {
    expect(itemTitle({ emoji: "🍍", name: "Ананас", description: "Сочный" })).toBe("🍍Ананас - Сочный");
    expect(itemTitle({ name: "GTX" })).toBe("GTX");
  });

  it("merges both stores into shared lines and replaces only the imported store", async () => {
    const db = fakeSupabase();
    const main = categoriesFromSheets([
      sheet("Жидкости ( salt)", [["Tasty Lab"], [], ["Рик 50mg"], ["15 BYN"], ["", "🍌Банан", "✅"], ["", "🍉Арбуз", "❌"]]),
      sheet("Снюс", [["Drymost 75mg"], ["16 BYN"], ["", "Mint", "✅"]]),
    ]);
    const kg = categoriesFromSheets([
      sheet("Жидкости Salt", [["Tasty Lab"], [], ["Рик 50mg"], ["14 BYN"], ["", "🍌Банан", "❌"], ["", "🍓Клубника", "✅"]]),
    ]);

    const r1 = await importCategories("main", main);
    expect(r1).toMatchObject({ lines: { total: 2, created: 2 }, items: { total: 3, created: 3 } });
    const r2 = await importCategories("kamennaya-gorka", kg);
    // «Рик 50mg» и «Банан» уже есть — добавилась только «Клубника».
    expect(r2).toMatchObject({ lines: { total: 1, created: 0 }, items: { total: 2, created: 1 } });

    const snap = db.snapshot();
    expect(snap.lines).toHaveLength(2);
    expect(snap.items).toHaveLength(4);
    expect(snap.lines[0]).toMatchObject({ brand: "Tasty Lab", name: "Рик 50mg", category_id: "liquids" });

    const kgCatalog = catalogFromSnapshot(snap, "kamennaya-gorka");
    expect(kgCatalog.groups[0].items.map((i) => [i.name, i.price, i.status])).toEqual([
      ["Банан", 14, "out"],
      ["Клубника", 14, "in"],
    ]);
    const mainCatalog = catalogFromSnapshot(snap, "main");
    expect(mainCatalog.groups.map((g) => g.line)).toEqual(["Рик 50mg", "Drymost 75mg"]);

    // Повторный импорт точки ничего не дублирует, а CSV одного листа не трогает другие категории.
    await importCategories("main", main);
    await importCategories("main", categoryFromCsv("Жидкости ( salt)", "Tasty Lab\n\nРик 50mg\n16 BYN\n,🍌Банан,✅\n"));
    const after = db.snapshot();
    expect(after.items).toHaveLength(4);
    const mainAfter = catalogFromSnapshot(after, "main");
    expect(mainAfter.groups.map((g) => [g.line, g.items.map((i) => `${i.name}:${i.price}`)])).toEqual([
      ["Рик 50mg", ["Банан:16"]],
      ["Drymost 75mg", ["Mint:16"]],
    ]);
  });
});

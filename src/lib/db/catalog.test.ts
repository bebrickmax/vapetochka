import { describe, expect, it } from "vitest";
import { toProduct } from "@/lib/products";
import { buildHaystack, matches, parseQuery } from "@/lib/search";
import { catalogFromSnapshot } from "./catalog";
import type { DbSnapshot } from "./types";

const snapshot: DbSnapshot = {
  categories: [
    { id: "snus", title: "Снюс", sort: 20 },
    { id: "liquids", title: "Жидкости", sort: 10 },
  ],
  lines: [
    { id: "11111111-aaaa-bbbb-cccc-000000000001", category_id: "liquids", brand: "Tasty Lab", section: null, name: "Рик и Морти 50mg", note: null, image_url: "https://x/rick.png", sort: 10 },
    { id: "11111111-aaaa-bbbb-cccc-000000000002", category_id: "snus", brand: null, section: null, name: "Drymost 75mg", note: null, image_url: null, sort: 10 },
  ],
  items: [
    { id: "i2", line_id: "11111111-aaaa-bbbb-cccc-000000000001", title: "🍉Арбуз - Сочный", variant: null, image_url: null, sort: 20 },
    { id: "i1", line_id: "11111111-aaaa-bbbb-cccc-000000000001", title: "🍌Банан", variant: null, image_url: null, sort: 10 },
    { id: "i3", line_id: "11111111-aaaa-bbbb-cccc-000000000002", title: "Mint", variant: null, image_url: null, sort: 10 },
  ],
  stock: [
    { item_id: "i1", store_id: "main", price: "15.00", old_price: null, in_stock: true },
    { item_id: "i2", store_id: "main", price: 15, old_price: 18, in_stock: false },
    { item_id: "i3", store_id: "kamennaya-gorka", price: 16, old_price: null, in_stock: true },
  ],
};

describe("catalogFromSnapshot", () => {
  it("builds the storefront catalog of one store in sort order", () => {
    const catalog = catalogFromSnapshot(snapshot, "main");
    expect(catalog.source).toBe("db");
    expect(catalog.categories.map((c) => c.id)).toEqual(["liquids"]); // в снюсе нет позиций этой точки
    const [rick] = catalog.groups;
    expect(rick).toMatchObject({ line: "Рик и Морти 50mg", brand: "Tasty Lab", family: "Tasty Lab", strength: "50 мг", image: "https://x/rick.png" });
    expect(rick.items).toEqual([
      { emoji: "🍌", name: "Банан", price: 15, status: "in" },
      { emoji: "🍉", name: "Арбуз", description: "Сочный", price: 15, oldPrice: 18, status: "out" },
    ]);
  });

  it("shows only what the store has", () => {
    const kg = catalogFromSnapshot(snapshot, "kamennaya-gorka");
    expect(kg.categories.map((c) => c.title)).toEqual(["Снюс"]);
    expect(kg.groups[0]).toMatchObject({ line: "Drymost 75mg", family: "Drymost" });
    expect(kg.groups[0].items[0]).toMatchObject({ name: "Mint", price: 16, status: "in" });
  });

  it("carries the «Новинка» marks of lines and flavours", () => {
    const marked: DbSnapshot = {
      ...snapshot,
      lines: snapshot.lines.map((l, i) => ({ ...l, is_new: i === 1 })),
      items: snapshot.items.map((item) => ({ ...item, is_new: item.id === "i2" })),
    };
    const [rick] = catalogFromSnapshot(marked, "main").groups;
    expect(rick.isNew).toBeUndefined();
    expect(rick.items.map((i) => i.isNew)).toEqual([undefined, true]);
    const [drymost] = catalogFromSnapshot(marked, "kamennaya-gorka").groups;
    expect(drymost.isNew).toBe(true);
    // Новинки находятся поиском «новинка».
    const query = parseQuery("новинка");
    expect(matches(buildHaystack(toProduct(drymost, 0)), query)).toBe(true);
    expect(matches(buildHaystack(toProduct(rick, 0)), query)).toBe(false);
    expect(matches(buildHaystack(toProduct(rick, 1)), query)).toBe(true);
  });

  it("drops a stale old price that is not above the current one", () => {
    const raised: DbSnapshot = { ...snapshot, stock: snapshot.stock.map((s) => (s.item_id === "i2" ? { ...s, price: 20 } : s)) };
    const [rick] = catalogFromSnapshot(raised, "main").groups;
    expect(rick.items[1]).toEqual({ emoji: "🍉", name: "Арбуз", description: "Сочный", price: 20, status: "out" });
  });
});

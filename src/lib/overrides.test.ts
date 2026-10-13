import { describe, expect, it } from "vitest";
import { applyOverrides, nextOverride, sheetValues, type SheetOverride } from "./overrides";
import { toProduct } from "./products";
import type { ProductGroup, StockStatus } from "./types";

const group = (items: [string, StockStatus, number | null][]): ProductGroup => ({
  id: "liquids-abc",
  categoryId: "liquids",
  line: "Рик 50mg",
  items: items.map(([name, status, price]) => ({ name, status, price })),
});
const idOf = (g: ProductGroup, i: number) => toProduct(g, i).id;

describe("overrides on top of the sheet", () => {
  const sheet = group([
    ["Банан", "in", 15],
    ["Арбуз", "in", 15],
  ]);
  const base = (i: number) => ({ storeId: "main", productId: idOf(sheet, i), ...sheetValues([sheet]).get(idOf(sheet, i))! });

  it("admin change wins while the sheet keeps the same value", () => {
    const banana = nextOverride(undefined, base(0), { inStock: false })!;
    const melon = nextOverride(undefined, base(1), { price: 17 })!;
    const { groups, active, cleanup } = applyOverrides([sheet], [banana, melon]);
    expect(groups[0].items.map((i) => `${i.name}:${i.status}:${i.price}`)).toEqual(["Банан:out:15", "Арбуз:in:17"]);
    expect(active.get(idOf(sheet, 0))).toEqual({ stock: true, price: false });
    expect(cleanup).toEqual({ remove: [], update: [] });
    expect(sheet.items[0].status).toBe("in"); // исходные данные не тронуты
  });

  it("the sheet wins after someone edits the same cell, and the stale override is cleaned up", () => {
    const banana = nextOverride(undefined, base(0), { inStock: false, price: 14 })!;
    // В таблице поменяли цену Банана на 16 — правка цены устарела, наличие ещё действует.
    const edited = group([
      ["Банан", "in", 16],
      ["Арбуз", "in", 15],
    ]);
    const { groups, cleanup } = applyOverrides([edited], [banana]);
    expect(groups[0].items[0]).toMatchObject({ status: "out", price: 16 });
    expect(cleanup.update).toEqual([{ ...banana, price_set: false, price: null, sheet_price: null }]);

    // В таблице поставили ❌ и новую цену — правка устарела целиком.
    const out = group([
      ["Банан", "out", 16],
      ["Арбуз", "in", 15],
    ]);
    expect(applyOverrides([out], [banana]).cleanup.remove).toEqual([idOf(sheet, 0)]);
  });

  it("setting the sheet value back removes the override; deleted products drop their overrides", () => {
    const banana = nextOverride(undefined, base(0), { inStock: false })!;
    expect(nextOverride(banana, base(0), { inStock: true })).toBeNull();
    const orphan: SheetOverride = { ...banana, product_id: "liquids-gone-1" };
    expect(applyOverrides([sheet], [orphan]).cleanup.remove).toEqual(["liquids-gone-1"]);
  });

});

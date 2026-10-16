import { describe, expect, it } from "vitest";
import { itemRef, planCleanup, planLines, planStock, type SheetItem, type SheetLine, type SyncContext } from "./sync-plan";
import type { DbItem, DbLine, DbSnapshot, DbStock } from "./types";

const ctx = (patch: Partial<SyncContext> = {}): SyncContext => ({
  storeId: "main",
  priorStores: [],
  first: false,
  force: false,
  onlyNew: false,
  ...patch,
});

const sheetItem = (key: string, patch: Partial<SheetItem> = {}): SheetItem => ({
  key,
  title: key,
  variant: null,
  image: null,
  status: "in",
  price: 15,
  oldPrice: null,
  sort: 10,
  ...patch,
});

/** Линейка «L» с n вкусами в базе и в таблице; в таблице — первые inSheet из них. */
function fixture(n: number, inSheet = n, stock: Partial<DbStock> = {}) {
  const line: DbLine = { id: "line-1", category_id: "liquids", brand: null, section: null, name: "L", note: null, image_url: null, sort: 10, sheet_key: "l" };
  const items: DbItem[] = Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    line_id: line.id,
    title: `v${i}`,
    variant: null,
    image_url: null,
    sort: (i + 1) * 10,
    sheet_key: `v${i}`,
  }));
  const rows: DbStock[] = items.map((item) => ({
    item_id: item.id,
    store_id: "main",
    price: 15,
    old_price: null,
    in_stock: true,
    sheet_status: "in",
    sheet_price: 15,
    ...stock,
  }));
  const snapshot: DbSnapshot = { categories: [{ id: "liquids", title: "Жидкости", sort: 10 }], lines: [line], items, stock: rows };
  const sheet: SheetLine[] = [
    {
      categoryId: "liquids",
      key: "l",
      name: "L",
      brand: null,
      section: null,
      note: null,
      image: null,
      sort: 10,
      items: items.slice(0, inSheet).map((item) => sheetItem(item.sheet_key!)),
    },
  ];
  const lineIds = new Map([["liquids::l", line.id]]);
  const itemIds = new Map(items.map((item) => [itemRef(line.id, item.sheet_key!), item.id]));
  return { snapshot, sheet, lineIds, itemIds };
}

describe("синхронизация: старая цена", () => {
  it("меняет зачёркнутую цену, даже если основная цена в таблице та же", () => {
    const { snapshot, sheet, lineIds, itemIds } = fixture(1, 1, { old_price: 18 });
    sheet[0].items[0].oldPrice = 20;
    const plan = planStock(sheet, itemIds, lineIds, snapshot, ctx());
    expect(plan.upsert).toEqual([expect.objectContaining({ item_id: "item-0", price: 15, old_price: 20 })]);

    sheet[0].items[0].oldPrice = null; // скидку убрали
    expect(planStock(sheet, itemIds, lineIds, snapshot, ctx()).upsert).toEqual([
      expect.objectContaining({ price: 15, old_price: null }),
    ]);
  });

  it("не трогает цену, поставленную в админке", () => {
    const { snapshot, sheet, lineIds, itemIds } = fixture(1, 1, { price: 12, old_price: null });
    sheet[0].items[0].oldPrice = 20;
    const plan = planStock(sheet, itemIds, lineIds, snapshot, ctx());
    expect(plan.upsert).toEqual([expect.objectContaining({ price: 12, old_price: 20, sheet_price: 15 })]);
  });

  it("ничего не пишет, если всё совпадает", () => {
    const { snapshot, sheet, lineIds, itemIds } = fixture(3);
    expect(planStock(sheet, itemIds, lineIds, snapshot, ctx()).upsert).toEqual([]);
  });
});

describe("синхронизация: таблица прочиталась не целиком", () => {
  it("с запасным списком листов ничего не удаляет", () => {
    const { snapshot, sheet, lineIds, itemIds } = fixture(30, 20);
    const partial = ctx({ partial: true });
    const plan = planStock(sheet, itemIds, lineIds, snapshot, partial);
    expect(plan).toMatchObject({ remove: [], removalSkipped: true, skipReason: "partial" });
    const cleanup = planCleanup(snapshot, { storeId: "main", itemIds: [] }, { lines: new Set(), items: new Set() }, partial);
    expect(cleanup).toEqual({ items: [], lines: [] });
  });

  it("при обычном чтении убирает то, чего нет в таблице", () => {
    const { snapshot, sheet, lineIds, itemIds } = fixture(30, 20);
    const plan = planStock(sheet, itemIds, lineIds, snapshot, ctx());
    expect(plan.removalSkipped).toBe(false);
    expect(plan.remove).toHaveLength(10);
  });

  it("массовое удаление по-прежнему придерживает", () => {
    const { snapshot, sheet, lineIds, itemIds } = fixture(60, 10);
    expect(planStock(sheet, itemIds, lineIds, snapshot, ctx())).toMatchObject({ remove: [], removalSkipped: true, skipReason: "mass" });
  });
});

describe("синхронизация: фото", () => {
  it("«только новые» тоже докачивает недостающие фото", () => {
    const { snapshot, sheet } = fixture(1);
    sheet[0].image = "https://docs.google.com/sheets-images-rt/abcdefghijklmnopqrstuvwxyz";
    const plan = planLines(sheet, snapshot, ctx({ onlyNew: true }));
    expect(plan.photos).toEqual([{ kind: "line", ref: "line-1", url: sheet[0].image }]);
  });
});

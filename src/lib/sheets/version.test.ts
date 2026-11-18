import { describe, expect, it } from "vitest";
import { CATALOG_VERSION_META, sheetsVersion, versionFromHtml } from "./version";

const base = () => ({
  sheets: [
    { title: "Жидкости", gid: "1", rows: [["Husky 20mg"], ["15 BYN"], ["", "Банан", "✅"]] },
    { title: "Поды", gid: "2", rows: [["Xros 4"], ["90 BYN"], ["", "Чёрный", "❌"]] },
  ],
  wholesale: { title: "ОПТ", gid: "9", rows: [["Husky", "10", "9", "8", "7"]] },
});

describe("версия таблицы", () => {
  it("одинаковые значения — одна версия; фото не влияют (ссылки Google меняются сами)", () => {
    const withPhotos = base();
    withPhotos.sheets = withPhotos.sheets.map((s) => ({ ...s, images: { 0: `https://docs.google.com/sheets-images-rt/${"x".repeat(30)}` } }));
    expect(sheetsVersion(base())).toBe(sheetsVersion(base()));
    expect(sheetsVersion(withPhotos)).toBe(sheetsVersion(base()));
    expect(sheetsVersion(base())).toMatch(/^[0-9a-f]{24}$/);
  });

  it("меняется от наличия, цены, порядка листов, листа ОПТ и запасного списка листов", () => {
    const original = sheetsVersion(base());
    const stock = base();
    stock.sheets[0].rows[2][2] = "❌";
    const price = base();
    price.sheets[1].rows[1][0] = "95 BYN";
    const order = base();
    order.sheets.reverse();
    const wholesale = base();
    wholesale.wholesale.rows[0][1] = "11";
    const versions = [
      sheetsVersion(stock),
      sheetsVersion(price),
      sheetsVersion(order),
      sheetsVersion(wholesale),
      sheetsVersion({ ...base(), wholesale: undefined }),
      sheetsVersion({ ...base(), partial: true }),
    ];
    expect(new Set([original, ...versions]).size).toBe(versions.length + 1);
  });

  it("читается со страницы при любом порядке атрибутов", () => {
    const v = "0123456789abcdef01234567";
    expect(versionFromHtml(`<head><meta name="${CATALOG_VERSION_META}" content="${v}"/></head>`)).toBe(v);
    expect(versionFromHtml(`<meta content="${v}" name="${CATALOG_VERSION_META}">`)).toBe(v);
    expect(versionFromHtml(`<meta name="description" content="${v}">`)).toBeNull();
    expect(versionFromHtml("<html></html>")).toBeNull();
  });
});

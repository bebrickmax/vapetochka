import { describe, expect, it } from "vitest";
import { demoSheets } from "@/data/demo-sheets";
import { buildCatalog } from "@/lib/catalog";
import { displayLine, flattenGroups, productTitle } from "@/lib/products";
import { buildHaystack, matches, parseQuery } from "@/lib/search";
import { isDesktopDevice, orderMessage, telegramLink } from "@/lib/telegram";

const catalog = buildCatalog(demoSheets, "demo");
const products = flattenGroups(catalog.groups);
const index = products.map((p) => ({
  p,
  hay: buildHaystack(p, catalog.categories.find((c) => c.id === p.categoryId)),
}));
const search = (q: string) => {
  const query = parseQuery(q);
  return index.filter(({ hay }) => matches(hay, query)).map(({ p }) => productTitle(p));
};

describe("product ids", () => {
  it("do not depend on row numbers", () => {
    const rows = (extra: string[][]) => [
      ...extra,
      ["Skala 20mg"],
      ["11 BYN"],
      ["", "Банан", "✅"],
      ["", "Вишня", "✅"],
    ];
    const ids = (sheetRows: string[][]) =>
      flattenGroups(buildCatalog([{ title: "Жидкости", rows: sheetRows }], "demo").groups)
        .filter((p) => p.line === "Skala 20mg")
        .map((p) => [p.name, p.id]);
    const before = ids(rows([]));
    // Сверху добавили новую линейку — id позиций Skala не меняются.
    const after = ids(rows([["Duall 20mg"], ["12 BYN"], ["", "Арбуз", "✅"], []]));
    expect(after).toEqual(before);
    expect(new Set(before.map(([, id]) => id)).size).toBe(2);
  });
});

describe("search", () => {
  it("finds by brand, flavor and strength in any order", () => {
    expect(search("skala банан")).toEqual(["Skala 20mg — Банан со льдом"]);
    expect(search("банан 20mg skala")).toEqual(["Skala 20mg — Банан со льдом"]);
    expect(search("20 мг банан")).toContain("Skala 20mg — Банан со льдом");
  });

  it("understands wrong keyboard layout and transliteration", () => {
    expect(search("ылфдф")).toEqual(search("skala"));
    expect(search("скала").length).toBeGreaterThan(0);
    expect(search("элфбар")).toEqual(search("elfbar"));
  });

  it("uses synonyms", () => {
    expect(search("watermelon ice")).toContain("Elfbar BC4000 5% — Watermelon ice");
    expect(search("арбуз лед")).toContain("Elfbar BC4000 5% — Watermelon ice");
  });

  it("ignores ё and case", () => {
    expect(search("ЧЁРНЫЙ")).toContain("Drymost 175mg — Atomic Black");
  });
});

describe("telegram", () => {
  it("builds the order deep link", () => {
    const banana = products.find((p) => p.name === "Банан со льдом")!;
    const text = orderMessage(banana);
    expect(text).toBe("Здравствуйте, хочу заказать: Skala 20mg — Банан со льдом за 11 BYN");
    const link = telegramLink(text);
    expect(link.app).toBe(`tg://resolve?domain=VapeTochkaManager&text=${encodeURIComponent(text)}`);
    expect(link.web).toBe(`https://t.me/VapeTochkaManager?text=${encodeURIComponent(text)}`);
    expect(link.plain).toEqual({ app: "tg://resolve?domain=VapeTochkaManager", web: "https://t.me/VapeTochkaManager" });
    expect(link.text).toBe(text);
  });

  it("tells computers from phones", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
    expect(isDesktopDevice(mac, 0)).toBe(true);
    expect(isDesktopDevice(win, 0)).toBe(true);
    expect(isDesktopDevice(iphone, 5)).toBe(false);
    expect(isDesktopDevice(android, 5)).toBe(false);
    // iPad с iPadOS притворяется Mac, но у него сенсорный экран.
    expect(isDesktopDevice(mac, 5)).toBe(false);
  });

  it("asks about restock for unavailable items", () => {
    const pineapple = products.find((p) => p.name === "Ананас со льдом")!;
    expect(orderMessage(pineapple)).toBe("Здравствуйте! Подскажите, когда будет в наличии: Skala 20mg — Ананас со льдом?");
  });
});

describe("displayLine", () => {
  it("removes strength already shown as a chip", () => {
    expect(displayLine("Skala 20mg", "20 мг")).toBe("Skala");
    expect(displayLine("Монашка Sweet 80 mg", "80 мг")).toBe("Монашка Sweet");
    expect(displayLine("Elfbar BC4000 5%", "5%")).toBe("Elfbar BC4000");
    expect(displayLine("Xros 6 mini")).toBe("Xros 6 mini");
  });
});

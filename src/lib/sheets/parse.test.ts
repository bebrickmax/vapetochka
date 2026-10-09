import { describe, expect, it } from "vitest";
import { demoSheets } from "@/data/demo-sheets";
import { buildCatalog } from "@/lib/catalog";
import { parseCsv } from "./csv";
import { parsePrice, parseSheet, parseStatus, parseStrength, splitItemName } from "./parse";

const sheet = (title: string) => demoSheets.find((s) => s.title === title)!.rows;

describe("cell helpers", () => {
  it("parses prices", () => {
    expect(parsePrice("20 BYN")).toBe(20);
    expect(parsePrice(" 13 BYN ")).toBe(13);
    expect(parsePrice("10,5 byn")).toBe(10.5);
    expect(parsePrice("Skala 20mg")).toBeNull();
  });

  it("parses statuses", () => {
    expect(parseStatus("✅ ")).toBe("in");
    expect(parseStatus("❌")).toBe("out");
    expect(parseStatus("Нет в наличии")).toBe("out");
    expect(parseStatus("0.6 Ом")).toBeNull();
    expect(parseStatus("—")).toBeNull();
  });

  it("extracts strength", () => {
    expect(parseStrength("Skala 20mg")).toBe("20 мг");
    expect(parseStrength("Монашка Sweet 80 mg")).toBe("80 мг");
    expect(parseStrength("Elfbar 1500 5%")).toBe("5%");
    expect(parseStrength("Xros 6 mini")).toBeUndefined();
  });

  it("splits emoji, name and description", () => {
    expect(splitItemName("🥖🍓Pop the glock - Поджаристый тост")).toEqual({
      emoji: "🥖🍓",
      name: "Pop the glock",
      description: "Поджаристый тост",
    });
    expect(splitItemName("🍋‍🟩❄️Lime Mint -Мята Лайм")).toEqual({
      emoji: "🍋‍🟩❄️",
      name: "Lime Mint",
      description: "Мята Лайм",
    });
    expect(splitItemName("🍓🍌Банан-Клубника")).toEqual({ emoji: "🍓🍌", name: "Банан-Клубника" });
    expect(splitItemName("12 штук")).toEqual({ name: "12 штук" });
  });
});

describe("parseSheet", () => {
  it("parses liquid lines with brand headers and skips notices", () => {
    const groups = parseSheet(sheet("Жидкости ( salt)"), "liquids");
    expect(groups.map((g) => g.line)).toEqual([
      "Skala 20mg",
      "Alfa Toxic 50mg",
      "Рик и Морти на замерзоне 50mg",
      "Catswill Hotspot 70mg",
      "Catswill Sour 20mg",
    ]);
    const [skala, , rick, hotspot, sour] = groups;
    expect(skala.brand).toBeUndefined();
    expect(skala.strength).toBe("20 мг");
    expect(skala.items[1]).toEqual({ emoji: "🍌❄️", name: "Банан со льдом", price: 11, status: "in" });
    expect(rick.brand).toBe("Tasty Lab");
    expect(rick.items[0]).toMatchObject({ name: "Ананасовый флиппи", description: "Гуава ананас", price: 15 });
    // Одиночный ❌ под заголовком не ломает разбор.
    expect(hotspot.brand).toBe("Catswill");
    expect(hotspot.items[0].price).toBe(17);
    // Бренд сохраняется для следующих линеек, пока не появится новый.
    expect(sour.brand).toBe("Catswill");
  });

  it("inherits item name and reads variant column (consumables)", () => {
    const groups = parseSheet(sheet("Расходники "), "consumables");
    const smoant = groups[0];
    expect(smoant.line).toBe("Smoant");
    expect(smoant.items.map((i) => [i.name, i.variant, i.price, i.status])).toEqual([
      ["Charon baby / Veer", "0.6 Ом", 10, "in"],
      ["Santi / Charon baby+", "0.3 Ом", 10, "in"],
      ["Santi / Charon baby+", "0.4 Ом", 10, "out"],
      ["Santi / Charon baby+", "0.6 Ом", 10, "in"],
    ]);
    const cartridges = groups[2];
    expect(cartridges).toMatchObject({ brand: "Картриджи", line: "Vaporesso" });
    expect(cartridges.items.at(-1)).toMatchObject({ name: "Luxe XR", price: 15, status: "in" });
    expect(cartridges.items.at(-1)?.variant).toBeUndefined();
  });

  it("treats text right under a header as a note", () => {
    const groups = parseSheet(sheet("Койла, Вата и др."), "coils");
    const coils = groups.find((g) => g.line === "Койла Mlt/Rdl")!;
    expect(coils.note).toBe("Сопротивление на одном койле, цена за пару");
    expect(coils.items).toHaveLength(2);
    expect(coils.brand).toBeUndefined();
  });

  it("changes price mid-group", () => {
    const coal = parseSheet(sheet("Кальяный табак"), "hookah").find((g) => g.line === "Уголь Cocoloco")!;
    expect(coal.items.map((i) => i.price)).toEqual([9, 28]);
  });

  it("detects sale prices (two prices in a row)", () => {
    const [loot] = parseSheet(sheet("Распродажа "), "sale");
    expect(loot.items.map((i) => [i.price, i.oldPrice])).toEqual([
      [12, 16],
      [12, 16],
      [12, 16],
      [12, 16],
    ]);
  });

  it("allows a blank row between a line and its price", () => {
    const [glitch] = parseSheet([["Glitch 150mg"], [], ["15 BYN "], ["", "🍏Apple - Яблоко", "✅"]], "snus");
    expect(glitch).toMatchObject({ line: "Glitch 150mg", strength: "150 мг" });
    expect(glitch.items[0]).toMatchObject({ name: "Apple", price: 15, status: "in" });
  });

  it("uses the latest price when a higher price follows (no sale)", () => {
    const [boost] = parseSheet(
      [["Aegis Boost 3"], ["115 BYN"], ["130 BYN", "Black", "❌"], ["", "Sliver", "✅"]],
      "pods",
    );
    expect(boost.items.map((i) => [i.price, i.oldPrice])).toEqual([
      [130, undefined],
      [130, undefined],
    ]);
  });

  it("marks items without a status as unknown", () => {
    const [group] = parseSheet([["Test 10mg"], ["5 BYN"], ["", "Вкус"]], "x");
    expect(group.items[0].status).toBe("unknown");
  });
});

describe("buildCatalog", () => {
  it("keeps sheet order, maps titles and drops empty sheets", () => {
    const catalog = buildCatalog([...demoSheets, { title: "Лист69", rows: [] }], "demo");
    expect(catalog.categories.map((c) => c.id)).toEqual([
      "liquids",
      "consumables",
      "disposables",
      "snus",
      "pods",
      "coils",
      "hookah",
      "drinks",
      "sale",
    ]);
    expect(catalog.categories[0].title).toBe("Жидкости");
  });
});

describe("parseCsv", () => {
  it("handles quotes, commas and newlines", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n,"x\ny",\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["", "x\ny", ""],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { assignFamilies, nameWords, prettyBrand } from "./brands";
import { parseStrength } from "./sheets/parse";

const lines = (...names: string[]) => names.map((line) => ({ line, strength: parseStrength(line) }));

describe("assignFamilies", () => {
  it("uses the brand from the sheet and softens caps", () => {
    expect(
      assignFamilies([
        { line: "Skala 20mg", strength: "20 мг" },
        { line: "Duall 20mg", strength: "20 мг", brand: "DUALL" },
        { line: "Pixel 20mg", strength: "20 мг", brand: "Liquid" },
        { line: "Pixel ICE 20mg", strength: "20 мг", brand: "Liquid" },
      ]),
    ).toEqual(["Skala", "Duall", "Pixel", "Pixel"]);
  });

  it("groups lines by their common first word", () => {
    expect(
      assignFamilies(
        lines(
          "Drymost 5mg",
          "Drymost Black Tornado 200mg",
          "Glitch 75mg",
          "Glitch 150mg",
          "Faff PZDC 150mg",
          "Rick and Morty 150mg",
          "KASTA COVID 120mg",
          "Faff 200mg",
          "Яблочки Faff",
          "Iceberg HOTACE 120mg с капсулой",
          "Iceberg 50 mg",
        ),
      ),
    ).toEqual([
      "Drymost",
      "Drymost",
      "Glitch",
      "Glitch",
      "Faff",
      "Rick and Morty",
      "Kasta Covid",
      "Faff",
      "Faff",
      "Iceberg",
      "Iceberg",
    ]);
  });

  it("merges spelling variants and knows device makers", () => {
    expect(
      assignFamilies(
        lines("Elfbar 1500 5%", "ELF BAR LUSH KING 35000 5%", "HQD Go 35000 5%", "HQD 7000 5%", "Waka 20000 7%"),
      ),
    ).toEqual(["Elfbar", "Elfbar", "HQD", "HQD", "Waka"]);
    expect(assignFamilies(lines("Xros 6 mini", "Luxe XR Max 2", "Aegis Hero 5", "Pasito 3", "Vmate Mini"))).toEqual([
      "Vaporesso",
      "Vaporesso",
      "GeekVape",
      "Smoant",
      "Voopoo",
    ]);
  });

  it("keeps «X and Y» names together", () => {
    expect(
      assignFamilies(
        lines("Рик и Морти на замерзоне 20mg", "Рик и Морти на замерзоне Sour 20mg", "Rick And Morty Bad Trip 60mg", "Rick and Morty Bad Ice 60mg", "Faff 50mg"),
      ),
    ).toEqual(["Рик и Морти", "Рик и Морти", "Rick And Morty", "Rick And Morty", "Faff"]);
  });

  it("drops product-type words", () => {
    expect(
      assignFamilies(
        lines("Никотиновые Пластины Podonki", "Podonki Critical", "PODONKI x MAD", "Энергетик Monster 330ml", "Энергетик Monster 500ml"),
      ),
    ).toEqual(["Podonki", "Podonki", "Podonki", "Monster", "Monster"]);
  });
});

describe("helpers", () => {
  it("cleans names", () => {
    expect(nameWords("Elfbar BC4000 5%", "5%")).toEqual(["Elfbar", "BC"]);
    expect(nameWords("MustHave 25g")).toEqual(["MustHave"]);
    expect(prettyBrand("BJORN")).toBe("Bjorn");
    expect(prettyBrand("HQD Liquid")).toBe("HQD Liquid");
  });
});

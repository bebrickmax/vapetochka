import { describe, expect, it } from "vitest";
import { imageBaseUrl, parseSheetImages, parseTabList, sizedImage } from "./htmlview";

const IMG = (id: string, size = "w149-h41") =>
  `<div style="width:149px;height:41px;"><img src="https://docs.google.com/u/0/sheets-images-rt/${id}=${size}" style="width:inherit;"/></div>`;

describe("parseTabList", () => {
  it("reads sheet names and gids from the htmlview page", () => {
    const html = `var items = [];items.push({name: "Жидкости Salt", pageUrl: "https:\\/\\/docs.google.com\\/x?gid=618442738", gid: "618442738",initialSheet: ("618442738" == gid)});items.push({name: "Расходники ", pageUrl: "u", gid: "697847360",initialSheet: false});items.push({name: "Кофе \\x26 чай", pageUrl: "u", gid: "5",initialSheet: false});`;
    expect(parseTabList(html)).toEqual([
      { title: "Жидкости Salt", gid: "618442738" },
      { title: "Расходники ", gid: "697847360" },
      { title: "Кофе & чай", gid: "5" },
    ]);
  });

  it("returns nothing for unrelated pages", () => {
    expect(parseTabList("<html>Вход в аккаунт</html>")).toEqual([]);
  });
});

describe("parseSheetImages", () => {
  it("maps images in column A to zero-based row numbers", () => {
    const html = `<table class="waffle"><thead><tr><th class="row-header freezebar-origin-ltr"></th><th id="1C0">A</th><th id="1C1">B</th></tr></thead><tbody>
      <tr><th id="1R0"><div>1</div></th><td class="s0" colspan="3">Skala 20mg</td></tr>
      <tr><th id="1R71"><div>72</div></th><td class="s5" rowspan="2">${IMG("AAA")}</td><td class="s6">Алоэ</td><td>✅</td></tr>
      <tr><th id="1R72"><div>73</div></th><td class="s6">${IMG("BBB")} Банан</td><td>✅</td></tr>
      <tr><th id="1R80"><div>81</div></th><td>${IMG("CCC", "w203-h629")}</td><td>Арбуз</td></tr>
    </tbody></table>`;
    // Строка 72 (R72): колонка A занята объединённой ячейкой сверху, картинка стоит в колонке B — её не берём.
    expect(parseSheetImages(html)).toEqual({
      71: "https://docs.google.com/u/0/sheets-images-rt/AAA",
      80: "https://docs.google.com/u/0/sheets-images-rt/CCC",
    });
  });

  it("builds sized image urls", () => {
    expect(imageBaseUrl("https://docs.google.com/sheets-images-rt/X=w149-h41")).toBe(
      "https://docs.google.com/sheets-images-rt/X",
    );
    expect(sizedImage("https://docs.google.com/sheets-images-rt/X", 400)).toBe(
      "https://docs.google.com/sheets-images-rt/X=s400",
    );
  });
});

import { describe, expect, it } from "vitest";
import { alphabeticalOrder, alphabeticalOrderByLine, sortKey } from "./sort";

const item = (id: string, title: string, sort: number, line_id = "l1") => ({ id, title, sort, line_id, variant: null });

describe("alphabetical order", () => {
  it("ignores leading emoji and sorts in Russian order", () => {
    expect(sortKey("🍍❄️Ананас со льдом - Описание")).toBe("Ананас со льдом - Описание");
    const order = alphabeticalOrder([item("a", "🍉Арбуз", 10), item("b", "🍌Банан", 20), item("c", "🥭 Абрикос", 30)]);
    expect(Object.fromEntries(order)).toEqual({ c: 10, a: 20, b: 30 });
  });

  it("puts a new flavor in its place and leaves the rest untouched", () => {
    const order = alphabeticalOrder([item("a", "Арбуз", 10), item("b", "Вишня", 20), item("n", "Банан", 30)]);
    expect(Object.fromEntries(order)).toEqual({ n: 20, b: 30 });
  });

  it("sorts each line separately", () => {
    const order = alphabeticalOrderByLine(
      [item("a", "Вишня", 10, "l1"), item("b", "Арбуз", 20, "l1"), item("c", "Яблоко", 10, "l2"), item("d", "Груша", 20, "l2")],
      new Set(["l1"]),
    );
    expect(Object.fromEntries(order)).toEqual({ b: 10, a: 20 });
  });
});

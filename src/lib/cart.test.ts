import { describe, expect, it } from "vitest";
import {
  buildOrderMessage,
  cartTotals,
  emptyCheckoutForm,
  isValidPhone,
  sanitizeCart,
  setQty,
  validateCheckout,
  type CartItem,
} from "@/lib/cart";
import { isManagerOnline } from "@/lib/hours";

const scandalist = { id: "a", title: "The Scandalist 0mg — Bad Habits", price: 20 };
const elfbar = { id: "b", title: "Elfbar 1500 5% — Strawberry", price: 29 };
const cart: CartItem[] = [
  { ...scandalist, qty: 2 },
  { ...elfbar, qty: 1 },
];

describe("cart", () => {
  it("adds, changes and removes items", () => {
    let items = setQty([], scandalist, 1);
    items = setQty(items, scandalist, 3);
    items = setQty(items, elfbar, 1);
    expect(items.map((i) => [i.id, i.qty])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(setQty(items, scandalist, 0).map((i) => i.id)).toEqual(["b"]);
    expect(setQty(items, scandalist, 500)[0].qty).toBe(99);
  });

  it("counts totals and flags unpriced items", () => {
    expect(cartTotals(cart)).toEqual({ count: 3, sum: 69, hasUnpriced: false });
    expect(cartTotals([...cart, { id: "c", title: "X", price: null, qty: 1 }]).hasUnpriced).toBe(true);
    expect(cartTotals([{ id: "d", title: "Y", price: 0.1, qty: 3 }]).sum).toBe(0.3);
  });

  it("drops broken entries from storage", () => {
    expect(sanitizeCart("oops")).toEqual([]);
    expect(
      sanitizeCart([{ id: "a", title: "A", price: 5, qty: 2 }, { id: 1 }, { id: "b", title: "B", price: 1, qty: 0 }]),
    ).toEqual([{ id: "a", title: "A", price: 5, qty: 2 }]);
  });
});

describe("checkout", () => {
  it("rejects an empty cart and missing fields", () => {
    expect(validateCheckout([], { ...emptyCheckoutForm, station: "Немига" })).toHaveProperty("cart");
    expect(validateCheckout(cart, emptyCheckoutForm)).toHaveProperty("station");
    expect(validateCheckout(cart, { ...emptyCheckoutForm, method: "pickup" })).toHaveProperty("pickupPoint");
    const delivery = validateCheckout(cart, { ...emptyCheckoutForm, method: "delivery" });
    expect(Object.keys(delivery).sort()).toEqual(["address", "phone"]);
    expect(
      validateCheckout(cart, {
        ...emptyCheckoutForm,
        method: "delivery",
        address: "ул. Ленина 1",
        phone: "+375 29 123-45-67",
      }),
    ).toEqual({});
  });

  it("validates phone numbers", () => {
    expect(isValidPhone("+375291234567")).toBe(true);
    expect(isValidPhone("8 (029) 123-45-67")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("позвоните мне")).toBe(false);
  });

  it("builds a structured message for the manager", () => {
    expect(buildOrderMessage(cart, { ...emptyCheckoutForm, station: "Немига" })).toBe(
      [
        "Новый заказ!",
        "1. The Scandalist 0mg — Bad Habits x2 (40 BYN)",
        "2. Elfbar 1500 5% — Strawberry x1 (29 BYN)",
        "Итого: 69 BYN",
        "Способ получения: Метро (Немига)",
      ].join("\n"),
    );
    const delivery = buildOrderMessage([{ id: "c", title: "Под", price: null, qty: 1 }], {
      ...emptyCheckoutForm,
      method: "delivery",
      address: " ул. Ленина 1 ",
      phone: "+375 29 000-00-00",
    });
    expect(delivery).toContain("1. Под x1 (цена по запросу)");
    expect(delivery).toContain("Итого: 0 BYN + позиции с ценой по запросу");
    expect(delivery).toContain("Способ получения: Доставка (ул. Ленина 1, +375 29 000-00-00)");
  });
});

describe("manager hours", () => {
  it("is online from 11:30 to 21:15 Minsk time", () => {
    // Минск = UTC+3
    expect(isManagerOnline(new Date("2026-10-09T08:29:00Z"))).toBe(false);
    expect(isManagerOnline(new Date("2026-10-09T08:30:00Z"))).toBe(true);
    expect(isManagerOnline(new Date("2026-10-09T18:14:00Z"))).toBe(true);
    expect(isManagerOnline(new Date("2026-10-09T18:15:00Z"))).toBe(false);
  });
});

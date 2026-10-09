import { formatPrice } from "@/lib/format";
import { productTitle } from "@/lib/products";
import type { Product } from "@/lib/types";

/** Позиция в корзине — снимок товара на момент добавления. */
export interface CartItem {
  id: string;
  title: string;
  price: number | null;
  qty: number;
}

export const MAX_QTY = 99;

export function cartItemFromProduct(product: Product, qty = 1): CartItem {
  return { id: product.id, title: productTitle(product), price: product.price, qty };
}

/** Меняет количество позиции; 0 и меньше — удаляет её из корзины. */
export function setQty(items: CartItem[], item: Omit<CartItem, "qty">, qty: number): CartItem[] {
  const next = Math.min(Math.max(Math.trunc(qty), 0), MAX_QTY);
  const exists = items.some((i) => i.id === item.id);
  if (next === 0) return items.filter((i) => i.id !== item.id);
  if (!exists) return [...items, { ...item, qty: next }];
  return items.map((i) => (i.id === item.id ? { ...i, qty: next } : i));
}

export interface CartTotals {
  /** Сколько штук всего. */
  count: number;
  /** Сумма по позициям с известной ценой. */
  sum: number;
  /** Есть позиции «Цена по запросу» — итог неполный. */
  hasUnpriced: boolean;
}

export function cartTotals(items: CartItem[]): CartTotals {
  let count = 0;
  let sum = 0;
  let hasUnpriced = false;
  for (const item of items) {
    count += item.qty;
    if (item.price === null) hasUnpriced = true;
    else sum += item.price * item.qty;
  }
  return { count, sum: Math.round(sum * 100) / 100, hasUnpriced };
}

export function lineTotal(item: CartItem): number | null {
  return item.price === null ? null : Math.round(item.price * item.qty * 100) / 100;
}

/** Проверяет, что в сохранённой корзине нет мусора (localStorage мог быть изменён). */
export function sanitizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): CartItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const { id, title, price, qty } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof title !== "string") return [];
    if (price !== null && typeof price !== "number") return [];
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty < 1) return [];
    return [{ id, title, price, qty: Math.min(Math.trunc(qty), MAX_QTY) }];
  });
}

// ─── Оформление заказа ──────────────────────────────────────────────────────

export type DeliveryMethod = "metro" | "pickup" | "delivery";

export interface CheckoutForm {
  method: DeliveryMethod;
  station: string;
  pickupPoint: string;
  address: string;
  phone: string;
}

export const emptyCheckoutForm: CheckoutForm = {
  method: "metro",
  station: "",
  pickupPoint: "",
  address: "",
  phone: "",
};

export type CheckoutErrors = Partial<Record<"cart" | "station" | "pickupPoint" | "address" | "phone", string>>;

/** Белорусский или любой международный номер: 9–15 цифр, допускаются +, пробелы, скобки и дефисы. */
export function isValidPhone(phone: string): boolean {
  if (!/^\+?[\d\s()-]+$/.test(phone.trim())) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

export function validateCheckout(items: CartItem[], form: CheckoutForm): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (items.length === 0) errors.cart = "Корзина пуста — добавьте товары.";
  if (form.method === "metro" && !form.station) errors.station = "Выберите станцию метро.";
  if (form.method === "pickup" && !form.pickupPoint) errors.pickupPoint = "Выберите точку самовывоза.";
  if (form.method === "delivery") {
    if (form.address.trim().length < 5) errors.address = "Укажите адрес доставки.";
    if (!form.phone.trim()) errors.phone = "Укажите номер телефона.";
    else if (!isValidPhone(form.phone)) errors.phone = "Проверьте номер, например +375 29 123-45-67.";
  }
  return errors;
}

export function describeDelivery(form: CheckoutForm): string {
  switch (form.method) {
    case "metro":
      return `Метро (${form.station})`;
    case "pickup":
      return `Самовывоз (${form.pickupPoint})`;
    case "delivery":
      return `Доставка (${form.address.trim()}, ${form.phone.trim()})`;
  }
}

/** Текст заказа для менеджера в Telegram. */
export function buildOrderMessage(items: CartItem[], form: CheckoutForm): string {
  const lines = items.map((item, i) => {
    const total = lineTotal(item);
    const price = total === null ? "цена по запросу" : formatPrice(total);
    return `${i + 1}. ${item.title} x${item.qty} (${price})`;
  });
  const { sum, hasUnpriced } = cartTotals(items);
  const total = `Итого: ${formatPrice(sum)}${hasUnpriced ? " + позиции с ценой по запросу" : ""}`;
  return ["Новый заказ!", ...lines, total, `Способ получения: ${describeDelivery(form)}`].join("\n");
}

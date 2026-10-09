"use client";

import { cartItemFromProduct } from "@/lib/cart";
import type { Product } from "@/lib/types";
import { CartPlusIcon } from "../icons";
import { useCartActions, useCartQty } from "./CartProvider";
import { QtyStepper } from "./QtyStepper";

/** Кнопка «В корзину»; если товар уже в корзине — «− N +». */
export function AddToCart({ product }: { product: Product }) {
  const qty = useCartQty(product.id);
  const { setQty } = useCartActions();
  const item = cartItemFromProduct(product);

  if (qty > 0) {
    return (
      <QtyStepper
        qty={qty}
        label={item.title}
        onChange={(next) => setQty(item, next)}
        className="animate-fade-in min-w-[48%] shrink-0"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setQty(item, 1)}
      className="neon-button flex h-12 min-w-[48%] shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-white transition-transform active:scale-[0.96]"
    >
      <CartPlusIcon />В корзину
    </button>
  );
}

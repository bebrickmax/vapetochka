"use client";

import { cartItemFromProduct } from "@/lib/cart";
import type { Product } from "@/lib/types";
import { PlusIcon } from "../icons";
import { useCartActions, useCartQty } from "./CartProvider";
import { QtyStepper } from "./QtyStepper";

/** Круглая кнопка «+» у позиции; если позиция уже в корзине — «− N +». */
export function AddToCart({ product }: { product: Product }) {
  const qty = useCartQty(product.id);
  const { setQty } = useCartActions();
  const item = cartItemFromProduct(product);

  if (qty > 0) {
    return (
      <QtyStepper
        size="sm"
        tone="paper"
        qty={qty}
        label={item.title}
        onChange={(next) => setQty(item, next)}
        className="animate-fade-in w-[7.5rem] shrink-0"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setQty(item, 1)}
      aria-label={`В корзину: ${item.title}`}
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition hover:border-ink active:scale-90 active:bg-paper active:text-on-paper"
    >
      <PlusIcon width={18} height={18} />
    </button>
  );
}

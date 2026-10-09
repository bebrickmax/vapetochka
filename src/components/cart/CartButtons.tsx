"use client";

import { formatPrice, pluralize } from "@/lib/format";
import { CartIcon } from "../icons";
import { useCart, useCartDrawer } from "./CartProvider";

/** Кнопка корзины в шапке со счётчиком. */
export function HeaderCartButton() {
  const { totals } = useCart();
  const { setOpen } = useCartDrawer();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Корзина: ${totals.count} ${pluralize(totals.count, ["товар", "товара", "товаров"])}`}
      className="relative flex size-11 items-center justify-center rounded-2xl border border-line bg-surface-2/80 text-ink transition active:scale-95"
    >
      <CartIcon />
      {totals.count > 0 && (
        <span className="neon-button absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black tabular-nums text-white">
          {totals.count}
        </span>
      )}
    </button>
  );
}

/** Плавающая плашка внизу экрана: количество, сумма и переход в корзину. */
export function FloatingCart() {
  const { totals } = useCart();
  const { setOpen } = useCartDrawer();
  if (totals.count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="neon-button animate-pop-in fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] left-4 right-20 z-40 flex h-14 items-center gap-3 rounded-2xl px-4 text-white shadow-2xl transition-transform active:scale-[0.98] sm:left-auto sm:w-96"
    >
      <span className="relative">
        <CartIcon width={24} height={24} />
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black tabular-nums text-neon-violet">
          {totals.count}
        </span>
      </span>
      <span className="flex-1 text-left text-base font-bold">Корзина</span>
      <span className="text-lg font-black tabular-nums tracking-tight">
        {formatPrice(totals.sum)}
        {totals.hasUnpriced && totals.sum > 0 ? "+" : ""}
      </span>
    </button>
  );
}

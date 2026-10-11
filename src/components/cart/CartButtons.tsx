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
      className="relative flex size-11 items-center justify-center rounded-full border border-line-strong text-ink transition active:scale-95"
    >
      <CartIcon />
      {totals.count > 0 && (
        <span className="btn-paper absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-extrabold tabular-nums ring-2 ring-bg">
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
      className="btn-paper animate-pop-in fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] left-4 right-20 z-40 flex h-14 items-center gap-3 rounded-full pl-5 pr-6 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.9)] transition-transform active:scale-[0.98] sm:left-auto sm:w-96"
    >
      <span className="relative">
        <CartIcon width={22} height={22} />
        <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-on-paper px-1 text-[11px] font-extrabold tabular-nums text-paper">
          {totals.count}
        </span>
      </span>
      <span className="flex-1 text-left text-base font-bold">Корзина</span>
      <span className="font-wide text-[17px] font-semibold tabular-nums">
        {formatPrice(totals.sum)}
        {totals.hasUnpriced && totals.sum > 0 ? "+" : ""}
      </span>
    </button>
  );
}

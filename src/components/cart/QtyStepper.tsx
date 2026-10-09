"use client";

import { MAX_QTY } from "@/lib/cart";
import { MinusIcon, PlusIcon } from "../icons";

interface QtyStepperProps {
  qty: number;
  onChange: (qty: number) => void;
  label: string;
  size?: "md" | "sm";
  className?: string;
}

/** Контроллер «− 1 +». */
export function QtyStepper({ qty, onChange, label, size = "md", className = "" }: QtyStepperProps) {
  const height = size === "md" ? "h-12" : "h-9";
  const button = size === "md" ? "w-12" : "w-9";
  return (
    <div
      role="group"
      aria-label={`Количество: ${label}`}
      className={`flex ${height} items-center justify-between rounded-2xl border border-neon-violet/40 bg-neon-violet/10 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        aria-label={qty === 1 ? "Убрать из корзины" : "Уменьшить количество"}
        className={`flex h-full ${button} items-center justify-center rounded-2xl text-ink transition active:scale-90 active:bg-white/10`}
      >
        <MinusIcon width={18} height={18} />
      </button>
      <span className="min-w-6 text-center text-base font-black tabular-nums text-ink" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= MAX_QTY}
        aria-label="Увеличить количество"
        className={`flex h-full ${button} items-center justify-center rounded-2xl text-ink transition active:scale-90 active:bg-white/10 disabled:opacity-40`}
      >
        <PlusIcon width={18} height={18} />
      </button>
    </div>
  );
}

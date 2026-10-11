"use client";

import { MAX_QTY } from "@/lib/cart";
import { MinusIcon, PlusIcon } from "../icons";

interface QtyStepperProps {
  qty: number;
  onChange: (qty: number) => void;
  label: string;
  size?: "md" | "sm";
  /** paper — белая плашка (в списке товаров), outline — контур (в корзине). */
  tone?: "paper" | "outline";
  className?: string;
}

/** Контроллер «− 1 +». */
export function QtyStepper({ qty, onChange, label, size = "md", tone = "outline", className = "" }: QtyStepperProps) {
  const height = size === "md" ? "h-12" : "h-10";
  const button = size === "md" ? "w-12" : "w-10";
  const look = tone === "paper" ? "btn-paper" : "border border-line-strong text-ink";
  const press = tone === "paper" ? "active:bg-black/10" : "active:bg-white/10";
  return (
    <div
      role="group"
      aria-label={`Количество: ${label}`}
      className={`flex ${height} items-center justify-between rounded-full ${look} ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        aria-label={qty === 1 ? "Убрать из корзины" : "Уменьшить количество"}
        className={`flex h-full ${button} items-center justify-center rounded-full transition active:scale-90 ${press}`}
      >
        <MinusIcon width={18} height={18} />
      </button>
      <span className="font-wide min-w-6 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= MAX_QTY}
        aria-label="Увеличить количество"
        className={`flex h-full ${button} items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40 ${press}`}
      >
        <PlusIcon width={18} height={18} />
      </button>
    </div>
  );
}

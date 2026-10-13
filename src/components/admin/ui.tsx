"use client";

import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "../icons";

export const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink";

/** Переключатель «в наличии». Большая зона нажатия — удобно пальцем на смене. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-14 shrink-0 items-center justify-center disabled:opacity-40"
    >
      <span
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
          checked ? "bg-paper" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute left-0.5 size-6 rounded-full shadow transition-transform duration-200 ${
            checked ? "translate-x-5 bg-on-paper" : "bg-paper"
          }`}
        />
      </span>
    </button>
  );
}

/** Нижняя панель (на компьютере — окно по центру). */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-in relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] border border-line bg-raised sm:rounded-[28px]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="font-wide flex-1 text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-10 items-center justify-center rounded-full text-ink/80 active:bg-white/10"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && (
          <div className="space-y-2 border-t border-line px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-bold text-ink/90">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="btn-paper flex h-13 w-full items-center justify-center gap-2 rounded-full text-base font-bold transition active:scale-[0.98] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  danger = false,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
        danger ? "border-danger/60 text-danger" : "border-line-strong text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Выбор точек (одна или обе). */
export function StoreChecks({
  stores,
  value,
  onChange,
}: {
  stores: { id: string; title: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {stores.map((store) => {
        const on = value.includes(store.id);
        return (
          <button
            key={store.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== store.id) : [...value, store.id])}
            className={`min-h-12 rounded-2xl border px-3 py-2 text-sm font-bold transition active:scale-[0.98] ${
              on ? "btn-paper border-paper" : "border-line text-ink/80"
            }`}
          >
            {store.title}
          </button>
        );
      })}
    </div>
  );
}

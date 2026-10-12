"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { storeInfos, type StoreInfo } from "@/config/stores";
import { saveStoreChoice } from "@/lib/store-choice";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "./icons";
import { LogoMark } from "./Logo";

/** Кнопка с текущей точкой в шапке; по нажатию — выбор другой точки. */
export function StoreSwitcher({ store }: { store: StoreInfo }) {
  const [open, setOpen] = useState(false);

  // Запоминаем точку, в которую зашли по прямой ссылке, — в следующий раз откроется она же.
  useEffect(() => saveStoreChoice(store.id), [store.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-9 max-w-full items-center gap-2 rounded-full border border-line-strong pl-2.5 pr-3 text-[13px] font-bold text-ink transition active:scale-95"
      >
        <LogoMark className="h-4 w-auto shrink-0" />
        <span className="truncate">{store.title}</span>
        <ChevronDownIcon width={16} height={16} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Выбор точки"
            className="animate-sheet-in relative w-full max-w-md rounded-t-[28px] border border-line bg-raised p-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-[28px]"
          >
            <div className="mb-4 flex items-center justify-between gap-3 pl-1">
              <h2 className="font-wide text-lg font-semibold">Выберите точку</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="flex size-10 items-center justify-center rounded-full text-ink/80 active:bg-white/10"
              >
                <CloseIcon />
              </button>
            </div>
            <ul className="space-y-2">
              {storeInfos.map((option) => {
                const current = option.id === store.id;
                return (
                  <li key={option.id}>
                    <Link
                      href={`/${option.id}`}
                      onClick={() => {
                        saveStoreChoice(option.id);
                        setOpen(false);
                      }}
                      aria-current={current ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-[20px] border p-3.5 transition active:scale-[0.98] ${
                        current ? "border-ink" : "border-line"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-wide block text-[15px] font-semibold">{option.title}</span>
                        <span className="mt-0.5 block text-[13px] text-muted">{option.subtitle}</span>
                      </span>
                      {current && <CheckIcon className="shrink-0" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 px-1 text-xs text-muted">Корзина у каждой точки своя: наличие в них разное.</p>
          </div>
        </div>
      )}
    </>
  );
}

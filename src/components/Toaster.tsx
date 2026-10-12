"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";
import { TOAST_EVENT } from "./TelegramAnchor";

const DURATION_MS = 5000;

/** Короткая подсказка внизу экрана (например, «текст скопирован»). */
export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const onToast = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), DURATION_MS);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="status"
      className="animate-pop-in fixed inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-strong bg-raised px-4 py-3 text-sm font-semibold text-ink shadow-[0_12px_40px_-8px_rgb(0_0_0/0.9)]"
    >
      <CheckIcon className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}

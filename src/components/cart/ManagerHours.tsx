"use client";

import { useSyncExternalStore } from "react";
import { managerHours } from "@/config/checkout";
import { isManagerOnline } from "@/lib/hours";
import { ClockIcon } from "../icons";

const subscribeMinute = (callback: () => void) => {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
};

/** Плашка «Время работы менеджера» с отметкой, на связи ли он сейчас. */
export function ManagerHours() {
  // На сервере статус неизвестен — показываем только часы работы.
  const online = useSyncExternalStore(
    subscribeMinute,
    () => isManagerOnline(),
    () => null,
  );

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <ClockIcon className="shrink-0 text-ink" />
      <div className="min-w-0 text-sm leading-snug">
        <p className="font-semibold text-ink">
          Время работы менеджера:{" "}
          <span className="whitespace-nowrap">
            с {managerHours.from} до {managerHours.to}
          </span>
        </p>
        {online !== null && (
          <p
            className={`mt-0.5 flex items-center gap-1.5 text-xs font-semibold ${online ? "text-ink" : "text-muted"}`}
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${online ? "bg-paper" : "border border-muted"}`}
            />
            {online ? "Сейчас на связи" : `Сейчас не в сети — ответит с ${managerHours.from}`}
          </p>
        )}
      </div>
    </div>
  );
}

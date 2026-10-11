"use client";

import { telegramLink } from "@/lib/telegram";
import { TelegramIcon } from "./icons";
import { LogoMark } from "./Logo";
import { TelegramAnchor } from "./TelegramAnchor";

interface EmptyStateProps {
  query: string;
  /** Сколько позиций нашлось бы без фильтра «Только в наличии». */
  hiddenOutOfStock: number;
  onShowAll: () => void;
}

export function EmptyState({ query, hiddenOutOfStock, onShowAll }: EmptyStateProps) {
  const message = query.trim()
    ? `Здравствуйте! Ищу: ${query.trim()}. Есть в наличии или аналог?`
    : "Здравствуйте! Помогите подобрать товар.";

  return (
    <div className="animate-fade-in flex flex-col items-center gap-4 rounded-[26px] border border-dashed border-line-strong px-6 py-12 text-center">
      <LogoMark className="h-14 w-auto text-white/20" />
      <div className="space-y-1">
        <p className="font-wide text-lg font-semibold">
          {hiddenOutOfStock > 0 ? "Сейчас нет в наличии" : "Ничего не нашли"}
        </p>
        <p className="text-sm text-muted">
          {hiddenOutOfStock > 0
            ? "Эти позиции ожидаются. Менеджер подскажет сроки или подберёт аналог."
            : "Попробуйте другое слово или спросите менеджера — подберём аналог."}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {hiddenOutOfStock > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="h-11 rounded-full border border-line-strong text-sm font-semibold transition active:scale-[0.97]"
          >
            Показать ожидаемые ({hiddenOutOfStock})
          </button>
        )}
        <TelegramAnchor
          link={telegramLink(message)}
          className="btn-paper flex h-11 items-center justify-center gap-2 rounded-full text-sm font-bold transition active:scale-[0.97]"
        >
          <TelegramIcon width={18} height={18} />
          Спросить менеджера
        </TelegramAnchor>
      </div>
    </div>
  );
}

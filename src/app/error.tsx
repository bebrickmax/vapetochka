"use client";

import { TelegramIcon } from "@/components/icons";
import { TelegramAnchor } from "@/components/TelegramAnchor";
import { telegramLink } from "@/lib/telegram";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        😵‍💫
      </div>
      <h1 className="text-xl font-bold">Не удалось загрузить каталог</h1>
      <p className="text-sm text-muted">Попробуйте обновить страницу. Заказ можно оформить напрямую у менеджера.</p>
      <button
        type="button"
        onClick={reset}
        className="h-11 w-full rounded-2xl border border-line bg-surface-2 text-sm font-semibold active:scale-[0.97]"
      >
        Обновить
      </button>
      <TelegramAnchor
        link={telegramLink()}
        className="neon-button flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white active:scale-[0.97]"
      >
        <TelegramIcon width={18} height={18} />
        Написать менеджеру
      </TelegramAnchor>
    </div>
  );
}

"use client";

import { TelegramIcon } from "@/components/icons";
import { LogoMark } from "@/components/Logo";
import { TelegramAnchor } from "@/components/TelegramAnchor";
import { telegramLink } from "@/lib/telegram";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark className="h-16 w-auto text-white/25" />
      <h1 className="font-wide text-xl font-semibold">Не удалось загрузить каталог</h1>
      <p className="text-sm text-muted">Попробуйте обновить страницу. Заказ можно оформить напрямую у менеджера.</p>
      <button
        type="button"
        onClick={reset}
        className="h-11 w-full rounded-full border border-line-strong text-sm font-semibold active:scale-[0.97]"
      >
        Обновить
      </button>
      <TelegramAnchor
        link={telegramLink()}
        className="btn-paper flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold active:scale-[0.97]"
      >
        <TelegramIcon width={18} height={18} />
        Написать менеджеру
      </TelegramAnchor>
    </div>
  );
}

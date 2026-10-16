"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { StoreInfo } from "@/config/stores";
import { readStoreChoice, saveStoreChoice } from "@/lib/store-choice";
import { Logo, LogoMark } from "./Logo";

/**
 * Экран выбора точки. Если точка уже выбрана на этом устройстве, в её каталог
 * (с #категорией из ссылки) переводит ещё до загрузки сайта скрипт в <head>
 * (INTRO_SCRIPT), а здесь — только при переходе на главную внутри сайта.
 * С ?change=1 — всегда показывает выбор. Экран виден сразу, без скриптов:
 * ссылки на точки работают, даже если JavaScript не загрузился.
 */
export function StorePicker({ stores }: { stores: StoreInfo[] }) {
  const router = useRouter();

  useEffect(() => {
    const saved = readStoreChoice();
    if (saved && !new URLSearchParams(window.location.search).has("change")) router.replace(`/${saved}${window.location.hash}`);
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),2.5rem)]">
      <Logo className="animate-rise h-auto w-56 text-ink" />

      <div className="mt-auto pt-16">
        <h1 className="font-wide text-[26px] font-semibold leading-tight">Выберите прайс</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Наличие в них разное. Каталог покажет то, что есть в выбранном прайсе.
        </p>

        <ul className="mt-6 space-y-3">
          {stores.map((store) => (
            <li key={store.id}>
              <Link
                href={`/${store.id}`}
                onClick={() => saveStoreChoice(store.id)}
                className="group flex items-center gap-4 rounded-[22px] border border-line-strong p-4 transition active:scale-[0.98] hover:border-ink"
              >
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-paper text-on-paper">
                  <LogoMark className="h-8 w-auto" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-wide block text-[17px] font-semibold leading-snug">{store.title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted">{store.subtitle}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          Выбирая прайс, вы подтверждаете, что вам исполнилось 18 лет. Выбор запомнится на этом устройстве, сменить
          прайс можно в шапке каталога.
        </p>
      </div>
    </main>
  );
}

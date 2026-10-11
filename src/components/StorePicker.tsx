"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StoreInfo } from "@/config/stores";
import { readStoreChoice, saveStoreChoice } from "@/lib/store-choice";
import { Logo, LogoMark } from "./Logo";

/**
 * Экран выбора точки. Если точка уже выбрана на этом устройстве, сразу
 * переводит в её каталог (сохраняя #категорию из ссылки). С ?change=1 —
 * всегда показывает выбор: так работает кнопка «Сменить точку».
 */
export function StorePicker({ stores }: { stores: StoreInfo[] }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = readStoreChoice();
    if (saved && !params.has("change")) {
      router.replace(`/${saved}${window.location.hash}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- выбор хранится только в браузере
    setChecking(false);
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),2.5rem)]">
      <Logo className="animate-rise h-auto w-56 text-ink" />

      <div className={`mt-auto pt-16 transition-opacity duration-300 ${checking ? "opacity-0" : "opacity-100"}`}>
        <h1 className="font-wide text-[26px] font-semibold leading-tight">Выберите точку</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          В каждой точке своё наличие. Каталог покажет то, что есть именно там.
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
          Выбор запомнится на этом устройстве. Сменить точку можно в шапке каталога. Продажа только лицам старше 18 лет.
        </p>
      </div>
    </main>
  );
}

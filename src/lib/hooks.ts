"use client";

import { useCallback, useEffect, useState } from "react";

/** useState, который запоминает значение в localStorage (если он доступен). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- читаем сохранённое значение после гидрации
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      /* приватный режим или повреждённое значение — используем значение по умолчанию */
    }
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [value, update] as const;
}

/** true, когда страница прокручена дальше порога. */
export function useScrolledPast(threshold: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return past;
}

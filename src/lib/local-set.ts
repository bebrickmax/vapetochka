"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * Небольшое хранилище набора строк в localStorage (избранное и т.п.):
 * общее для всех компонентов страницы и синхронное между вкладками браузера.
 */

const EMPTY: readonly string[] = [];
const cache = new Map<string, readonly string[]>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): readonly string[] {
  if (cache.has(key)) return cache.get(key)!;
  let value: readonly string[] = EMPTY;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (Array.isArray(parsed)) value = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    /* приватный режим или повреждённое значение */
  }
  cache.set(key, value);
  return value;
}

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function write(key: string, value: readonly string[]) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  emit(key);
}

function subscribe(key: string, listener: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    cache.delete(key);
    emit(key);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set!.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Набор строк, сохранённый на устройстве, и переключатель элемента. */
export function useLocalSet(key: string) {
  const items = useSyncExternalStore(
    useCallback((l: () => void) => subscribe(key, l), [key]),
    () => read(key),
    () => EMPTY,
  );
  const toggle = useCallback(
    (id: string) => {
      const current = read(key);
      write(key, current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
    },
    [key],
  );
  return [items, toggle] as const;
}

export const favoritesKey = (storeId: string) => `vt:fav:${storeId}`;

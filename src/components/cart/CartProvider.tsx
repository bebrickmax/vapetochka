"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cartTotals, sanitizeCart, setQty, type CartItem } from "@/lib/cart";

const STORAGE_KEY = "vt:cart";
const EMPTY: CartItem[] = [];

/**
 * Маленькое хранилище корзины: живёт выше каталога (не сбрасывается при смене
 * вкладок), сохраняется в localStorage и синхронизируется между вкладками браузера.
 * Карточки подписываются только на своё количество — лишних перерисовок нет.
 */
function createCartStore() {
  let items: CartItem[] = EMPTY;
  let loaded = false;
  const listeners = new Set<() => void>();

  const read = () => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      items = stored ? sanitizeCart(JSON.parse(stored)) : EMPTY;
    } catch {
      items = EMPTY; // приватный режим или повреждённое значение
    }
  };

  const emit = () => listeners.forEach((l) => l());

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    read();
    emit();
  };

  const getSnapshot = (): CartItem[] => {
    if (!loaded) {
      loaded = true;
      read();
    }
    return items;
  };

  return {
    getSnapshot,
    getServerSnapshot(): CartItem[] {
      return EMPTY;
    },
    subscribe(listener: () => void) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    update(fn: (items: CartItem[]) => CartItem[]) {
      items = fn(getSnapshot());
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        /* ignore */
      }
      emit();
    },
  };
}

type CartStore = ReturnType<typeof createCartStore>;

interface CartUi {
  store: CartStore;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartUi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createCartStore);
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ store, open, setOpen }), [store, open]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function useCartContext(): CartUi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart* должен вызываться внутри <CartProvider>");
  return ctx;
}

function useItems(store: CartStore) {
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot(), store.getServerSnapshot);
}

/** Действия с корзиной (не вызывают перерисовку при изменении содержимого). */
export function useCartActions() {
  const { store } = useCartContext();
  return useMemo(
    () => ({
      setQty: (item: Omit<CartItem, "qty">, qty: number) => store.update((items) => setQty(items, item, qty)),
      remove: (id: string) => store.update((items) => items.filter((i) => i.id !== id)),
      clear: () => store.update(() => EMPTY),
    }),
    [store],
  );
}

/** Количество конкретного товара в корзине (0 — нет в корзине). */
export function useCartQty(id: string): number {
  const { store } = useCartContext();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().find((i) => i.id === id)?.qty ?? 0,
    () => 0,
  );
}

/** Содержимое корзины и итоги. */
export function useCart() {
  const { store } = useCartContext();
  const items = useItems(store);
  const totals = useMemo(() => cartTotals(items), [items]);
  return { items, totals };
}

export function useCartDrawer() {
  const { open, setOpen } = useCartContext();
  return { open, setOpen };
}

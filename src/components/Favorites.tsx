"use client";

import { createContext, useContext, type ReactNode } from "react";
import { HeartIcon } from "./icons";

interface FavoritesValue {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
}

const FavoritesContext = createContext<FavoritesValue>({ ids: new Set(), toggle: () => {} });

/** Избранные линейки (свои у каждого прайса, хранятся на устройстве — см. useLocalSet). */
export function FavoritesProvider({ value, children }: { value: FavoritesValue; children: ReactNode }) {
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export const useFavorites = () => useContext(FavoritesContext);

/** Сердечко «в избранное» на карточке линейки. */
export function FavoriteButton({ id, title }: { id: string; title: string }) {
  const { ids, toggle } = useFavorites();
  const active = ids.has(id);
  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-pressed={active}
      aria-label={active ? `Убрать из избранного: ${title}` : `В избранное: ${title}`}
      className={`-mr-1.5 -mt-1.5 flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
        active ? "text-ink" : "text-muted hover:text-ink"
      }`}
    >
      <HeartIcon filled={active} width={21} height={21} />
    </button>
  );
}

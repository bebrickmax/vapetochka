import { STORE_STORAGE_KEY, storeInfos } from "@/config/stores";

/** Сохранённая на устройстве точка (или null, если выбора ещё не было). */
export function readStoreChoice(): string | null {
  try {
    const id = window.localStorage.getItem(STORE_STORAGE_KEY);
    return id && storeInfos.some((s) => s.id === id) ? id : null;
  } catch {
    return null; // приватный режим
  }
}

export function saveStoreChoice(id: string) {
  try {
    window.localStorage.setItem(STORE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

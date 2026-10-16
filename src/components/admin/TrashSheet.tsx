"use client";

import { useEffect, useMemo, useState } from "react";
import { pluralize } from "@/lib/format";
import { api, UnauthorizedError } from "./api";
import type { AdminData } from "./model";
import { inputClass, Sheet } from "./ui";

interface Entry {
  id: string;
  kind: "line" | "item";
  label: string;
  storeIds: string[];
  source: "admin" | "sheet";
  deletedAt: string;
  items: number;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * «Недавно удалённые» за 30 дней: удалённое в админке и убранное из Google Таблицы.
 * «Вернуть» — линейка или вкусы возвращаются со своими фото, ценами и наличием по точкам.
 */
export function TrashSheet({
  data,
  onClose,
  onRestored,
  onError,
}: {
  data: AdminData;
  onClose: () => void;
  /** Текст для уведомления; после него админка перечитывает каталог. */
  onRestored: (text: string) => void;
  onError: (error: unknown) => void;
}) {
  const [state, setState] = useState<{ ready: boolean; entries: Entry[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    api<{ ready: boolean; entries: Entry[] }>("/api/admin/trash")
      .then((next) => alive && setState(next))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof UnauthorizedError) onError(e);
        else setLoadError(e instanceof Error ? e.message : "Не удалось загрузить");
      });
    return () => {
      alive = false;
    };
  }, [onError]);

  const storeTitle = (id: string) => data.stores.find((s) => s.id === id)?.short ?? data.stores.find((s) => s.id === id)?.title ?? id;
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/ё/g, "е");
    const list = state?.entries ?? [];
    return q ? list.filter((e) => e.label.toLowerCase().replace(/ё/g, "е").includes(q)) : list;
  }, [state, query]);

  const restore = async (entry: Entry) => {
    setBusy(entry.id);
    try {
      const { text } = await api<{ text: string }>("/api/admin/trash", { body: { id: entry.id } });
      setState((s) => s && { ...s, entries: s.entries.filter((e) => e.id !== entry.id) });
      onRestored(text);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="Недавно удалённые" onClose={onClose}>
      {!state && !loadError && <p className="text-sm text-muted">Загружаю…</p>}
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {state && !state.ready && (
        <p className="rounded-2xl border border-danger/50 p-3 text-sm leading-relaxed">
          Чтобы удалённое можно было вернуть, обновите базу: Supabase → SQL Editor → вставьте новый <b>supabase/schema.sql</b> → Run.
          Удалённое до этого вернуть отсюда нельзя (только из ежедневной резервной копии).
        </p>
      )}
      {state?.ready && (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Всё, что удалили в админке или убрали из Google Таблицы за последние 30 дней. «Вернуть» — линейка или вкус
            встанут обратно со своими фото, ценами и наличием по точкам. Возвращённое из таблицы дальше живёт как
            добавленное в админке: синхронизация его не уберёт, а впишете строку в таблицу снова — свяжется сама.
          </p>
          {state.entries.length > 8 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти по названию"
              aria-label="Найти в удалённых"
              className={inputClass}
            />
          )}
          {state.entries.length === 0 && <p className="py-6 text-center text-sm text-muted">Ничего не удаляли</p>}
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold leading-snug">{entry.label}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted">
                    {entry.kind === "line"
                      ? `Линейка · ${entry.items} ${pluralize(entry.items, ["вкус", "вкуса", "вкусов"])}`
                      : `${entry.items} ${pluralize(entry.items, ["вкус", "вкуса", "вкусов"])}`}
                    {" · "}
                    {entry.source === "sheet" ? "убрали из таблицы" : "удалили в админке"}
                    {" · "}
                    {when(entry.deletedAt)}
                    {entry.storeIds.length > 0 && ` · ${entry.storeIds.map(storeTitle).join(", ")}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(entry)}
                  disabled={!!busy}
                  className="btn-paper h-10 shrink-0 rounded-full px-4 text-sm font-bold transition active:scale-95 disabled:opacity-50"
                >
                  {busy === entry.id ? "…" : "Вернуть"}
                </button>
              </li>
            ))}
          </ul>
          {entries.length === 0 && state.entries.length > 0 && <p className="text-center text-sm text-muted">Ничего не нашлось</p>}
        </>
      )}
    </Sheet>
  );
}

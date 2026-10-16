"use client";

import { useState } from "react";
import { api } from "./api";
import type { AdminData } from "./model";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet, StoreChecks } from "./ui";

type Mode = "replace" | "new";

const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

/**
 * Связь с Google Таблицами по точкам:
 *  «от таблицы» — база синхронизируется с таблицей сама; переход на админку — одной кнопкой;
 *  «от админки» — таблица не влияет; новинки из таблицы — по кнопке; можно вернуться на таблицу.
 */
export function ImportSheet({
  data,
  onClose,
  onDone,
  onSwitch,
}: {
  data: AdminData;
  onClose: () => void;
  onDone: () => void;
  /** Возвращает текст ошибки, если переключить не получилось. */
  onSwitch: (source: "sheet" | "db", storeId: string) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [csvStore, setCsvStore] = useState<string[]>([data.stores[0]?.id ?? "main"]);
  const [csvCategory, setCsvCategory] = useState(data.categories[0]?.title ?? "Жидкости");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvMode, setCsvMode] = useState<Mode>(data.lines.length > 0 ? "new" : "replace");

  const title = (id: string) => data.stores.find((s) => s.id === id)?.title ?? id;

  const call = async (key: string, request: () => Promise<string[]>) => {
    setBusy(key);
    try {
      const lines = await request();
      setLog((l) => [...lines.map((t) => `✓ ${t}`), ...l]);
      onDone();
    } catch (e) {
      setLog((l) => [`✗ ${e instanceof Error ? e.message : "Ошибка"}`, ...l]);
    } finally {
      setBusy(null);
    }
  };

  const sync = (storeId: string) =>
    call(`sync-${storeId}`, async () => {
      const { results } = await api<{ results: { text: string; error?: boolean }[] }>("/api/admin/sync", { body: { storeId } });
      const failed = results.find((r) => r.error);
      if (failed) throw new Error(failed.text);
      return results.map((r) => r.text);
    });

  const fromSheet = (storeId: string, mode: Mode) => {
    if (mode === "replace" && !window.confirm(`Заменить цены и наличие «${title(storeId)}» значениями из таблицы? Правки, сделанные в админке для этой точки, пропадут.`))
      return;
    void call(`${mode}-${storeId}`, async () => [(await api<{ text: string }>("/api/admin/import", { body: { source: "sheets", storeId, mode } })).text]);
  };

  const switchTo = async (source: "sheet" | "db", storeId: string) => {
    setBusy(`switch-${storeId}`);
    try {
      const error = await onSwitch(source, storeId);
      if (error) setLog((l) => [`✗ ${error}`, ...l]);
    } finally {
      setBusy(null);
    }
  };

  const importCsv = async () => {
    if (!csvFile) return;
    if (csvMode === "replace" && data.lines.length > 0 && !window.confirm("Заменить цены и наличие этой категории значениями из файла?")) return;
    const csv = await csvFile.text();
    for (const storeId of csvStore)
      await call(`csv-${storeId}`, async () => [
        (await api<{ text: string }>("/api/admin/import", { body: { source: "csv", storeId, category: csvCategory, csv, mode: csvMode } })).text,
      ]);
  };

  return (
    <Sheet title="Таблицы и импорт" onClose={onClose}>
      {!data.schemaReady && (
        <p className="rounded-2xl border border-danger/50 p-3 text-sm leading-relaxed">
          Сначала обновите базу: Supabase → SQL Editor → вставьте новый <b>supabase/schema.sql</b> → Run. После этого здесь
          появится синхронизация с таблицей и переход на админку одной кнопкой.
        </p>
      )}

      {data.schemaReady &&
        data.stores.map((store) => {
          const sheetMode = data.sources[store.id] === "sheet";
          const synced = time(data.syncedAt[store.id]);
          return (
            <section key={store.id} className="space-y-2 rounded-2xl border border-line-strong p-3">
              <h3 className="font-wide text-base font-semibold">{store.title}</h3>
              {sheetMode ? (
                <>
                  <p className="text-sm leading-relaxed text-ink/80">
                    <b>Сейчас: от Google Таблицы.</b> База — копия таблицы, обновляется сама: после правки таблицы и по
                    расписанию каждые 10 минут{synced ? ` (последний раз — ${synced})` : ""}. Вкусы, линейки, наличие и цены
                    можно менять и здесь.
                  </p>
                  <SecondaryButton onClick={() => sync(store.id)} disabled={!!busy}>
                    {busy === `sync-${store.id}` ? "Синхронизирую…" : "Обновить из таблицы сейчас"}
                  </SecondaryButton>
                  <PrimaryButton onClick={() => switchTo("db", store.id)} disabled={!!busy}>
                    {busy === `switch-${store.id}` ? "Переключаю…" : "Перейти на админку"}
                  </PrimaryButton>
                  <p className="text-xs leading-relaxed text-muted">
                    Всё уже в админке. Перед переключением подтянутся последние изменения таблицы и докачаются фото — если
                    фото много, кнопку попросит нажать ещё раз. Дальше таблица на сайт не влияет (кроме листа «ОПТ»).
                    Вернуться можно в любой момент.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-ink/80">
                    <b>Сейчас: от админки.</b> Таблица на сайт не влияет. Вписали новинку в таблицу — добавьте её кнопкой: придёт
                    только новое, цены и наличие остальных не изменятся.
                  </p>
                  <PrimaryButton onClick={() => fromSheet(store.id, "new")} disabled={!!busy}>
                    {busy === `new-${store.id}` ? "Ищу новые товары…" : "Добавить новые из таблицы"}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => fromSheet(store.id, "replace")} disabled={!!busy}>
                    {busy === `replace-${store.id}` ? "Обновляю…" : "Заменить наличие и цены из таблицы"}
                  </SecondaryButton>
                  <button
                    type="button"
                    onClick={() => switchTo("sheet", store.id)}
                    disabled={!!busy}
                    className="w-full pt-1 text-center text-[13px] font-semibold text-muted underline underline-offset-2"
                  >
                    {busy === `switch-${store.id}` ? "Переключаю…" : "Вернуть точку на Google Таблицу"}
                  </button>
                </>
              )}
            </section>
          );
        })}

      {!data.schemaReady &&
        data.stores.map((store) => (
          <PrimaryButton key={store.id} onClick={() => fromSheet(store.id, "replace")} disabled={!!busy}>
            {busy === `replace-${store.id}` ? "Импортирую… (до пары минут)" : `Импортировать «${store.title}»`}
          </PrimaryButton>
        ))}

      <p className="text-xs leading-relaxed text-muted">
        Правки из админки в саму таблицу не записываются. Таблица должна быть открыта по ссылке; если доступ закрыт — листы
        можно перенести через CSV ниже.
      </p>

      <section className="space-y-3 rounded-2xl border border-line p-3">
        <h3 className="font-wide text-base font-semibold">Из CSV одного листа</h3>
        <p className="text-xs leading-relaxed text-muted">
          В таблице откройте лист → Файл → Скачать → CSV. Фото в CSV не попадают — их можно добавить в админке.
        </p>
        {data.lines.length > 0 && (
          <div role="radiogroup" aria-label="Что сделать" className="grid grid-cols-2 gap-1 rounded-full border border-line p-1">
            {(
              [
                ["new", "Только новые"],
                ["replace", "Заменить всё"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={csvMode === value}
                onClick={() => setCsvMode(value)}
                className={`h-9 rounded-full text-[13px] font-bold transition ${csvMode === value ? "btn-paper" : "text-ink/75"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <Field label="Категория (лист)">
          <input list="admin-import-categories" value={csvCategory} onChange={(e) => setCsvCategory(e.target.value)} className={inputClass} />
          <datalist id="admin-import-categories">
            {data.categories.map((c) => (
              <option key={c.id} value={c.title} />
            ))}
          </datalist>
        </Field>
        <div className="space-y-1.5">
          <span className="block text-sm font-bold text-ink/90">Для точки</span>
          <StoreChecks stores={data.stores} value={csvStore} onChange={setCsvStore} />
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-11 file:rounded-full file:border file:border-line-strong file:bg-transparent file:px-4 file:font-semibold file:text-ink"
        />
        <PrimaryButton onClick={importCsv} disabled={!!busy || !csvFile || csvStore.length === 0}>
          {busy?.startsWith("csv") ? "Импортирую…" : "Импортировать CSV"}
        </PrimaryButton>
      </section>

      {log.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl bg-surface p-3 text-sm leading-snug">
          {log.map((line, i) => (
            <li key={i} className={line.startsWith("✗") ? "text-danger" : "text-ink/90"}>
              {line}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

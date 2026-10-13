"use client";

import { useState } from "react";
import type { ImportReport } from "@/lib/db/import";
import { pluralize } from "@/lib/format";
import { api } from "./api";
import type { AdminData } from "./model";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet, StoreChecks } from "./ui";

type Mode = "replace" | "new";

/**
 * Связь с Google Таблицами по точкам:
 *  «от таблицы» — товары берутся из таблицы сами; можно перенести точку в админку;
 *  «от админки» — новые товары из таблицы по кнопке, полная замена, возврат на таблицу.
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
  onSwitch: (source: "sheet" | "db", storeId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [csvStore, setCsvStore] = useState<string[]>([data.stores[0]?.id ?? "main"]);
  const [csvCategory, setCsvCategory] = useState(data.categories[0]?.title ?? "Жидкости");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvMode, setCsvMode] = useState<Mode>(data.lines.length > 0 ? "new" : "replace");

  const title = (id: string) => data.stores.find((s) => s.id === id)?.title ?? id;
  const inDb = (id: string) => data.stock.some((s) => s.store_id === id);
  const n = (count: number, forms: [string, string, string]) => `${count} ${pluralize(count, forms)}`;
  const describe = (r: ImportReport) => {
    const photos =
      r.photos.copied || r.photos.failed
        ? `, фото: ${r.photos.copied} перенесено${r.photos.failed ? `, ${r.photos.failed} не удалось` : ""}`
        : "";
    if (r.mode === "new") {
      if (r.lines.created === 0 && r.items.addedToStore === 0) return `«${title(r.storeId)}»: новых товаров в таблице нет`;
      return (
        `«${title(r.storeId)}»: добавлено ${n(r.items.addedToStore, ["позиция", "позиции", "позиций"])}` +
        (r.lines.created ? `, из них новых линеек — ${r.lines.created}` : "") +
        photos
      );
    }
    return (
      `«${title(r.storeId)}»: ${r.lines.total} линеек, ${r.items.total} позиций${photos}` +
      (r.switched ? ". Точка теперь работает от админки" : "")
    );
  };

  const run = async (key: string, body: object) => {
    setBusy(key);
    try {
      const report = await api<ImportReport>("/api/admin/import", { body });
      setLog((l) => [`✓ ${describe(report)}`, ...l]);
      onDone();
    } catch (e) {
      setLog((l) => [`✗ ${e instanceof Error ? e.message : "Ошибка импорта"}`, ...l]);
    } finally {
      setBusy(null);
    }
  };

  const moveToAdmin = (storeId: string) => {
    const text = inDb(storeId)
      ? `Перенести «${title(storeId)}» в админку заново? Цены и наличие станут как в таблице, и сайт этой точки будет работать от админки.`
      : `Перенести «${title(storeId)}» в админку? Товары, цены, наличие и фото скопируются из таблицы, и сайт этой точки будет работать от админки. Вернуть на таблицу можно в любой момент.`;
    if (window.confirm(text)) void run(`replace-${storeId}`, { source: "sheets", storeId, mode: "replace" });
  };

  const replaceFromSheet = (storeId: string) => {
    if (window.confirm(`Заменить цены и наличие «${title(storeId)}» значениями из таблицы? Правки, сделанные в админке для этой точки, пропадут.`))
      void run(`replace-${storeId}`, { source: "sheets", storeId, mode: "replace" });
  };

  const importCsv = async () => {
    if (!csvFile) return;
    if (csvMode === "replace" && data.lines.length > 0 && !window.confirm("Заменить цены и наличие этой категории значениями из файла?")) return;
    const csv = await csvFile.text();
    for (const storeId of csvStore) await run(`csv-${storeId}`, { source: "csv", storeId, category: csvCategory, csv, mode: csvMode });
  };

  return (
    <Sheet title="Таблицы и импорт" onClose={onClose}>
      {data.stores.map((store) => {
        const fromSheet = data.sources[store.id] === "sheet";
        return (
          <section key={store.id} className="space-y-2 rounded-2xl border border-line-strong p-3">
            <h3 className="font-wide text-base font-semibold">{store.title}</h3>
            {fromSheet ? (
              <>
                <p className="text-sm leading-relaxed text-ink/80">
                  <b>Сейчас: от Google Таблицы.</b> Новые товары и изменения из таблицы появляются на сайте сами. В админке —
                  быстрые правки наличия и цен поверх таблицы.
                </p>
                <SecondaryButton onClick={() => moveToAdmin(store.id)} disabled={!!busy}>
                  {busy === `replace-${store.id}` ? "Переношу… (до пары минут)" : "Перенести точку в админку"}
                </SecondaryButton>
                {inDb(store.id) && data.schemaReady && (
                  <button
                    type="button"
                    onClick={() => onSwitch("db", store.id)}
                    disabled={!!busy}
                    className="w-full text-center text-[13px] font-semibold text-muted underline underline-offset-2"
                  >
                    Переключить на уже перенесённые данные (без импорта)
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-ink/80">
                  <b>Сейчас: от админки.</b> Таблица на сайт не влияет. Вписали новинку в таблицу — добавьте её кнопкой ниже:
                  добавится только новое, цены и наличие остальных не изменятся.
                </p>
                <PrimaryButton onClick={() => run(`new-${store.id}`, { source: "sheets", storeId: store.id, mode: "new" })} disabled={!!busy}>
                  {busy === `new-${store.id}` ? "Ищу новые товары…" : "Добавить новые из таблицы"}
                </PrimaryButton>
                <SecondaryButton onClick={() => replaceFromSheet(store.id)} disabled={!!busy}>
                  {busy === `replace-${store.id}` ? "Импортирую… (до пары минут)" : "Заменить всё из таблицы"}
                </SecondaryButton>
                {data.schemaReady && (
                  <button
                    type="button"
                    onClick={() => onSwitch("sheet", store.id)}
                    disabled={!!busy}
                    className="w-full text-center text-[13px] font-semibold text-muted underline underline-offset-2"
                  >
                    Вернуть точку на Google Таблицу
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      <p className="text-xs leading-relaxed text-muted">
        Правки из админки в саму таблицу не записываются. Таблица должна быть открыта по ссылке; если доступ закрыт —
        перенесите листы через CSV ниже.
      </p>

      <section className="space-y-3 rounded-2xl border border-line p-3">
        <h3 className="font-wide text-base font-semibold">Из CSV одного листа</h3>
        <p className="text-xs leading-relaxed text-muted">
          В таблице откройте лист → Файл → Скачать → CSV. Фото в CSV не попадают — их можно добавить в админке. Точка
          переходит на админку только кнопкой «Перенести точку в админку» или «Переключить…».
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

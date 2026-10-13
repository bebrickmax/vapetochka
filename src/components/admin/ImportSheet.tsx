"use client";

import { useState } from "react";
import type { ImportReport } from "@/lib/db/import";
import { pluralize } from "@/lib/format";
import { api } from "./api";
import type { AdminData } from "./model";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet, StoreChecks } from "./ui";

type Mode = "replace" | "new";

/** Перенос ассортимента из Google Таблиц (или CSV одного листа) в базу. */
export function ImportSheet({ data, onClose, onDone }: { data: AdminData; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [csvStore, setCsvStore] = useState<string[]>([data.stores[0]?.id ?? "main"]);
  const [csvCategory, setCsvCategory] = useState(data.categories[0]?.title ?? "Жидкости");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const hasData = data.lines.length > 0;
  const [csvMode, setCsvMode] = useState<Mode>(hasData ? "new" : "replace");

  const title = (id: string) => data.stores.find((s) => s.id === id)?.title ?? id;
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
    return `«${title(r.storeId)}»: ${r.lines.total} линеек (новых ${r.lines.created}), ${r.items.total} позиций (новых ${r.items.created})${photos}`;
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

  const replaceFromSheets = (storeId: string) => {
    if (
      hasData &&
      !window.confirm(
        `Заменить цены и наличие «${title(storeId)}» значениями из таблицы? Правки, сделанные в админке для этой точки, пропадут.`,
      )
    )
      return;
    void run(`replace-${storeId}`, { source: "sheets", storeId, mode: "replace" });
  };

  const importCsv = async () => {
    if (!csvFile) return;
    if (csvMode === "replace" && hasData && !window.confirm("Заменить цены и наличие этой категории значениями из файла?")) return;
    const csv = await csvFile.text();
    for (const storeId of csvStore) await run(`csv-${storeId}`, { source: "csv", storeId, category: csvCategory, csv, mode: csvMode });
  };

  const newSection = (
    <section className="space-y-2 rounded-2xl border border-line-strong p-3">
      <h3 className="font-wide text-base font-semibold">Добавить новые товары из таблицы</h3>
      <p className="text-sm leading-relaxed text-ink/80">
        Вписали новую линейку или вкус в Google Таблицу — нажмите кнопку точки. Добавится только то, чего ещё нет
        в админке (с ценой, наличием и фото из таблицы). Цены и наличие остальных товаров не меняются.
      </p>
      {data.stores.map((store) => (
        <PrimaryButton
          key={store.id}
          onClick={() => run(`new-${store.id}`, { source: "sheets", storeId: store.id, mode: "new" })}
          disabled={!!busy}
        >
          {busy === `new-${store.id}` ? "Ищу новые товары…" : `Новые из «${store.title}»`}
        </PrimaryButton>
      ))}
    </section>
  );

  const replaceSection = (
    <section className="space-y-2">
      <h3 className="font-wide text-base font-semibold">{hasData ? "Полностью заменить из таблицы" : "Перенести всё из Google Таблицы"}</h3>
      <p className="text-sm leading-relaxed text-ink/80">
        {hasData
          ? "Цены и наличие точки станут такими же, как в таблице, — правки из админки для этой точки пропадут. Новые товары тоже добавятся."
          : "Переносит линейки, вкусы, цены, наличие и фото. Повторный перенос ничего не дублирует."}
      </p>
      {data.stores.map((store) =>
        hasData ? (
          <SecondaryButton key={store.id} onClick={() => replaceFromSheets(store.id)} disabled={!!busy}>
            {busy === `replace-${store.id}` ? "Импортирую… (до пары минут)" : `Заменить «${store.title}»`}
          </SecondaryButton>
        ) : (
          <PrimaryButton key={store.id} onClick={() => replaceFromSheets(store.id)} disabled={!!busy}>
            {busy === `replace-${store.id}` ? "Импортирую… (до пары минут)" : `Импортировать «${store.title}»`}
          </PrimaryButton>
        ),
      )}
    </section>
  );

  return (
    <Sheet title="Импорт из таблиц" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        Связь в одну сторону: таблица → админка и сайт. Правки из админки в таблицу не записываются.
      </p>

      {hasData ? (
        <>
          {newSection}
          {replaceSection}
        </>
      ) : (
        replaceSection
      )}

      <p className="text-xs leading-relaxed text-muted">
        Таблица должна быть открыта по ссылке. Если доступ закрыт — используйте импорт из CSV ниже.
      </p>

      <section className="space-y-3 rounded-2xl border border-line p-3">
        <h3 className="font-wide text-base font-semibold">Из CSV одного листа</h3>
        <p className="text-xs leading-relaxed text-muted">
          В таблице откройте лист → Файл → Скачать → CSV. Фото в CSV не попадают — их можно добавить в админке.
        </p>
        {hasData && (
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

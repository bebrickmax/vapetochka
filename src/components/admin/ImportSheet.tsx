"use client";

import { useState } from "react";
import type { ImportReport } from "@/lib/db/import";
import { api } from "./api";
import type { AdminData } from "./model";
import { Field, inputClass, PrimaryButton, Sheet, StoreChecks } from "./ui";

/** Перенос ассортимента из Google Таблиц (или CSV одного листа) в базу. */
export function ImportSheet({ data, onClose, onDone }: { data: AdminData; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [csvStore, setCsvStore] = useState<string[]>([data.stores[0]?.id ?? "main"]);
  const [csvCategory, setCsvCategory] = useState(data.categories[0]?.title ?? "Жидкости");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const title = (id: string) => data.stores.find((s) => s.id === id)?.title ?? id;
  const describe = (r: ImportReport) =>
    `«${title(r.storeId)}»: ${r.lines.total} линеек (новых ${r.lines.created}), ${r.items.total} позиций (новых ${r.items.created})` +
    (r.photos.copied || r.photos.failed ? `, фото: ${r.photos.copied} перенесено${r.photos.failed ? `, ${r.photos.failed} не удалось` : ""}` : "");

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

  const importCsv = async () => {
    if (!csvFile) return;
    const csv = await csvFile.text();
    for (const storeId of csvStore) await run(`csv-${storeId}`, { source: "csv", storeId, category: csvCategory, csv });
  };

  return (
    <Sheet title="Импорт ассортимента" onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink/80">
        Импорт переносит линейки, вкусы, цены, наличие и фото из таблицы в базу. Повторный импорт ничего не
        дублирует: он заменяет наличие и цены этой точки на те, что в таблице.
      </p>

      <section className="space-y-2">
        <h3 className="font-wide text-base font-semibold">Из Google Таблицы</h3>
        {data.stores.map((store) => (
          <PrimaryButton key={store.id} onClick={() => run(store.id, { source: "sheets", storeId: store.id })} disabled={!!busy}>
            {busy === store.id ? "Импортирую… (до пары минут)" : `Импортировать «${store.title}»`}
          </PrimaryButton>
        ))}
        <p className="text-xs leading-relaxed text-muted">
          Таблица должна быть открыта по ссылке. Если доступ к таблице закрыт — используйте импорт из CSV ниже.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-line p-3">
        <h3 className="font-wide text-base font-semibold">Из CSV одного листа</h3>
        <p className="text-xs leading-relaxed text-muted">
          В таблице откройте лист → Файл → Скачать → CSV. Фото в CSV не попадают — их можно добавить в админке.
        </p>
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

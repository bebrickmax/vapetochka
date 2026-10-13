"use client";

import { useState } from "react";
import type { DbItem, DbLine } from "@/lib/db/types";
import { brandsOf, type AdminData, type LineView } from "./model";
import { PhotoField } from "./PhotoField";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet, StoreChecks } from "./ui";

/** Действия, которые выполняет AdminApp (оптимистично + запрос к API). */
export interface AdminActions {
  setStock: (itemIds: string[], patch: { inStock?: boolean; price?: number | null }) => Promise<boolean>;
  updateItem: (id: string, patch: { title?: string; variant?: string | null; imageUrl?: string | null; stores?: string[] }) => Promise<boolean>;
  deleteItem: (id: string) => Promise<boolean>;
  updateLine: (id: string, patch: { name?: string; brand?: string | null; note?: string | null; categoryId?: string; imageUrl?: string | null }) => Promise<boolean>;
  deleteLine: (id: string) => Promise<boolean>;
}

const parsePrice = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** Редактирование линейки и массовые действия с её вкусами в выбранной точке. */
export function LineSheet({
  view,
  data,
  storeTitle,
  actions,
  onClose,
}: {
  view: LineView;
  data: AdminData;
  storeTitle: string;
  actions: AdminActions;
  onClose: () => void;
}) {
  const { line } = view;
  const [name, setName] = useState(line.name);
  const [brand, setBrand] = useState(line.brand ?? "");
  const [note, setNote] = useState(line.note ?? "");
  const [categoryId, setCategoryId] = useState(line.category_id);
  const [image, setImage] = useState(line.image_url ?? "");
  const [price, setPrice] = useState(view.price !== null ? String(view.price) : "");
  const [busy, setBusy] = useState(false);
  const ids = view.all.map((v) => v.item.id);

  const save = async () => {
    setBusy(true);
    const ok = await actions.updateLine(line.id, {
      name: name.trim(),
      brand: brand.trim() || null,
      note: note.trim() || null,
      categoryId,
      imageUrl: image || null,
    });
    setBusy(false);
    if (ok) onClose();
  };

  const applyPrice = async () => {
    const value = parsePrice(price);
    if (value !== null && !Number.isFinite(value)) return;
    setBusy(true);
    await actions.setStock(ids, { price: value });
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm(`Удалить линейку «${line.name}» со всеми вкусами (${data.items.filter((i) => i.line_id === line.id).length}) во всех точках?`)) return;
    if (await actions.deleteLine(line.id)) onClose();
  };

  return (
    <Sheet
      title={line.name}
      onClose={onClose}
      footer={
        <PrimaryButton onClick={save} disabled={busy || !name.trim()}>
          Сохранить
        </PrimaryButton>
      }
    >
      <section className="space-y-2 rounded-2xl border border-line p-3">
        <p className="text-sm font-bold">Все вкусы в точке «{storeTitle}» ({ids.length})</p>
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => actions.setStock(ids, { inStock: true })} disabled={busy}>
            Все в наличии
          </SecondaryButton>
          <SecondaryButton onClick={() => actions.setStock(ids, { inStock: false })} disabled={busy}>
            Все нет
          </SecondaryButton>
        </div>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Цена для всех, BYN"
            className={`${inputClass} flex-1`}
            aria-label="Цена для всех вкусов"
          />
          <button
            type="button"
            onClick={applyPrice}
            disabled={busy}
            className="h-12 shrink-0 rounded-2xl border border-line-strong px-4 text-sm font-bold active:scale-[0.98] disabled:opacity-50"
          >
            Применить
          </button>
        </div>
      </section>

      <Field label="Название линейки" hint="Крепость в названии («20mg», «5%») покажется значком на витрине.">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Бренд">
        <input list="admin-line-brands" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
        <datalist id="admin-line-brands">
          {brandsOf(data).map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </Field>
      <Field label="Категория">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Пояснение" hint="Например, «Цена за пару»">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>
      <PhotoField value={image} onChange={setImage} />

      <SecondaryButton danger onClick={remove}>
        Удалить линейку
      </SecondaryButton>
    </Sheet>
  );
}

/** Редактирование одной позиции (вкуса/модели). */
export function ItemSheet({
  item,
  data,
  actions,
  onClose,
}: {
  item: DbItem;
  data: AdminData;
  actions: AdminActions;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [variant, setVariant] = useState(item.variant ?? "");
  const [image, setImage] = useState(item.image_url ?? "");
  const [stores, setStores] = useState(data.stock.filter((s) => s.item_id === item.id).map((s) => s.store_id));
  const [busy, setBusy] = useState(false);
  const line: DbLine | undefined = data.lines.find((l) => l.id === item.line_id);

  const save = async () => {
    if (stores.length === 0) return;
    setBusy(true);
    const ok = await actions.updateItem(item.id, {
      title: title.trim(),
      variant: variant.trim() || null,
      imageUrl: image || null,
      stores,
    });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm(`Удалить «${item.title}» во всех точках?`)) return;
    if (await actions.deleteItem(item.id)) onClose();
  };

  return (
    <Sheet
      title={line ? line.name : "Позиция"}
      onClose={onClose}
      footer={
        <PrimaryButton onClick={save} disabled={busy || !title.trim() || stores.length === 0}>
          Сохранить
        </PrimaryButton>
      }
    >
      <Field label="Вкус / позиция" hint="Можно с эмодзи и описанием через « - »">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Вариант" hint="Сопротивление, объём — необязательно">
        <input value={variant} onChange={(e) => setVariant(e.target.value)} className={inputClass} />
      </Field>
      <div className="space-y-1.5">
        <span className="block text-sm font-bold text-ink/90">Где продаётся</span>
        <StoreChecks stores={data.stores} value={stores} onChange={setStores} />
        {stores.length === 0 && <p className="text-xs text-danger">Выберите хотя бы одну точку</p>}
      </div>
      <PhotoField value={image} onChange={setImage} />
      <SecondaryButton danger onClick={remove}>
        Удалить позицию
      </SecondaryButton>
    </Sheet>
  );
}

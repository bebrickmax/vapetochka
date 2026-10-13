"use client";

import { useMemo, useState } from "react";
import type { DbItem, DbLine } from "@/lib/db/types";
import { api } from "./api";
import { brandsOf, type AdminData } from "./model";
import { PhotoField } from "./PhotoField";
import { Field, inputClass, PrimaryButton, Sheet, StoreChecks, Toggle } from "./ui";

interface Props {
  data: AdminData;
  storeId: string;
  /** Открыть сразу для существующей линейки (кнопка «+ вкус» в линейке). */
  presetLine?: DbLine;
  onClose: () => void;
  onCreated: (result: { line: DbLine; items: DbItem[]; stores: string[]; price: number | null; inStock: boolean }) => void;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Добавление товара: новая линейка или новые вкусы в существующую. */
export function AddSheet({ data, storeId, presetLine, onClose, onCreated }: Props) {
  const [categoryId, setCategoryId] = useState(presetLine?.category_id ?? data.categories[0]?.id ?? "");
  const [brand, setBrand] = useState(presetLine?.brand ?? "");
  const [lineName, setLineName] = useState(presetLine?.name ?? "");
  const [titles, setTitles] = useState("");
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [stores, setStores] = useState<string[]>([storeId]);
  const [inStock, setInStock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const brands = useMemo(() => brandsOf(data, categoryId), [data, categoryId]);
  const linesInCategory = useMemo(
    () =>
      data.lines.filter(
        (l) => l.category_id === categoryId && (!brand.trim() || norm(l.brand ?? "") === norm(brand)),
      ),
    [data.lines, categoryId, brand],
  );
  // Совпало с существующей линейкой — вкусы добавятся в неё.
  const existing =
    presetLine ??
    data.lines.find(
      (l) => l.category_id === categoryId && norm(l.name) === norm(lineName) && norm(l.brand ?? "") === norm(brand),
    );

  const flavorList = titles
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const submit = async () => {
    setError("");
    if (!lineName.trim()) return setError("Укажите линейку или модель");
    if (flavorList.length === 0) return setError("Добавьте хотя бы один вкус или позицию");
    if (stores.length === 0) return setError("Выберите точку");
    setBusy(true);
    try {
      const body = existing
        ? { lineId: existing.id }
        : { line: { categoryId, brand: brand.trim() || undefined, name: lineName.trim(), imageUrl: image || undefined } };
      const result = await api<{ line: DbLine; items: DbItem[] }>("/api/admin/items", {
        body: {
          ...body,
          titles: flavorList,
          variant: variant.trim() || undefined,
          price: price.trim() || null,
          stores,
          inStock,
        },
      });
      const p = price.trim() ? Number(price.replace(",", ".")) : null;
      onCreated({ ...result, stores, price: p, inStock });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={presetLine ? `Добавить в «${presetLine.name}»` : "Новый товар"}
      onClose={onClose}
      footer={
        <>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <PrimaryButton onClick={submit} disabled={busy}>
            {busy ? "Сохраняю…" : `Добавить${flavorList.length > 1 ? ` (${flavorList.length})` : ""}`}
          </PrimaryButton>
        </>
      }
    >
      {!presetLine && (
        <>
          <Field label="Категория">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Бренд" hint="Выберите из списка или впишите новый.">
            <input list="admin-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Например, Tasty Lab" className={inputClass} />
            <datalist id="admin-brands">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Линейка / модель"
            hint={existing ? "Такая линейка уже есть — вкусы добавятся в неё." : "Крепость пишите в названии: «Skala 20mg», «Elfbar BC4000 5%»."}
          >
            <input list="admin-lines" value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="Например, Рик и Морти 50mg" className={inputClass} />
            <datalist id="admin-lines">
              {linesInCategory.map((l) => (
                <option key={l.id} value={l.name} />
              ))}
            </datalist>
          </Field>
        </>
      )}

      <Field label="Вкусы / позиции" hint="Каждый с новой строки. Можно с эмодзи и описанием через « - »: 🍓🍌Клубника банан - Сочный микс">
        <textarea
          value={titles}
          onChange={(e) => setTitles(e.target.value)}
          rows={4}
          placeholder={"🍌Банан\n🍉Арбуз со льдом"}
          className={`${inputClass} h-auto min-h-28 py-3 leading-snug`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Цена, BYN">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15" className={inputClass} />
        </Field>
        <Field label="Вариант" hint="Сопротивление, объём">
          <input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="0.6 Ом" className={inputClass} />
        </Field>
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-bold text-ink/90">Где продаётся</span>
        <StoreChecks stores={data.stores} value={stores} onChange={setStores} />
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-1">
        <span className="text-sm font-bold">Сразу в наличии</span>
        <Toggle checked={inStock} onChange={setInStock} label="Сразу в наличии" />
      </div>

      {!existing && <PhotoField value={image} onChange={setImage} />}
    </Sheet>
  );
}

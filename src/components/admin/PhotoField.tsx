"use client";

import { useRef, useState } from "react";
import { sizedPhoto } from "@/lib/photos";
import { uploadPhoto } from "./api";
import { inputClass } from "./ui";

/** Фото: загрузить с телефона (камера/галерея) или вставить ссылку. Необязательно. */
export function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await uploadPhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-bold text-ink/90">Фото (необязательно)</span>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-paper">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- превью любой ссылки
            <img src={sizedPhoto(value, 160)} alt="" className="size-full object-contain p-1" />
          ) : (
            <span className="text-xs text-on-paper/40">нет фото</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-11 rounded-full border border-line-strong text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Загружаю…" : value ? "Заменить фото" : "Загрузить фото"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="h-9 text-sm font-semibold text-muted">
              Убрать фото
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        type="url"
        inputMode="url"
        placeholder="…или ссылка на фото https://"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        className={inputClass}
      />
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

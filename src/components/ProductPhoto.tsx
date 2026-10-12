"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { sizedPhoto } from "@/lib/photos";
import { CloseIcon } from "./icons";
import { LogoMark } from "./Logo";

interface Photo {
  src: string;
  alt: string;
}

const ViewerContext = createContext<(photo: Photo) => void>(() => {});

/** Просмотр фото на весь экран: открывается по нажатию на «этикетку». */
export function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const close = useCallback(() => setPhoto(null), []);

  useEffect(() => {
    if (!photo) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [photo, close]);

  return (
    <ViewerContext.Provider value={setPhoto}>
      {children}
      {photo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={photo.alt}
          className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={close}
        >
          <div className="flex justify-end p-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <button
              type="button"
              onClick={close}
              aria-label="Закрыть фото"
              className="flex size-11 items-center justify-center rounded-full border border-line-strong text-ink"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            <div className="animate-pop-in flex max-h-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element -- фото берутся из Google Таблицы как есть */}
              <img
                src={sizedPhoto(photo.src, 1200)}
                alt={photo.alt}
                className="max-h-[72dvh] w-full object-contain p-4"
              />
              <p className="border-t border-black/10 px-5 py-3 text-center text-sm font-semibold text-on-paper">
                {photo.alt}
              </p>
            </div>
          </div>
        </div>
      )}
    </ViewerContext.Provider>
  );
}

interface ProductPhotoProps {
  src?: string;
  alt: string;
  className?: string;
  /** Размер картинки, которую попросить у Google (по длинной стороне, px). */
  size?: number;
}

/**
 * Белая «этикетка» с фото товара. Без фото (или если картинка не загрузилась)
 * показывает знак логотипа — карточки остаются ровными.
 */
export function ProductPhoto({ src, alt, className = "", size = 360 }: ProductPhotoProps) {
  const open = useContext(ViewerContext);
  const [failed, setFailed] = useState(false);
  const usable = src && !failed;

  if (!usable) {
    return (
      <div aria-hidden className={`flex items-center justify-center rounded-[18px] border border-line bg-surface ${className}`}>
        <LogoMark className="h-[38%] w-auto text-white/15" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open({ src, alt })}
      aria-label={`Фото: ${alt}`}
      className={`group relative overflow-hidden rounded-[18px] bg-paper ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- фото берутся из Google Таблицы как есть */}
      <img
        src={sizedPhoto(src, size)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="size-full object-contain p-1.5 transition-transform duration-300 group-active:scale-95"
      />
    </button>
  );
}

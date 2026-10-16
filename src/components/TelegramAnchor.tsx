"use client";

import type { MouseEvent, ReactNode } from "react";
import { isAppleMobile, isDesktopDevice, type TelegramLink } from "@/lib/telegram";

const FALLBACK_DELAY_MS = 1200;

/** Событие для всплывающей подсказки (её показывает <Toaster />). */
export const TOAST_EVENT = "vt:toast";

export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}

/** Копирует текст в буфер обмена; true — если получилось. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Запасной способ для старых браузеров.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

interface OpenOptions {
  /** Не показывать подсказку «текст скопирован» (экран заказа объясняет сам). */
  silent?: boolean;
}

const onAppleMobile = () => isAppleMobile(navigator.userAgent, navigator.maxTouchPoints ?? 0);

/**
 * Открывает Telegram по диплинку tg://resolve. Если приложение не открылось
 * (страница не потеряла фокус), переходит на веб-версию t.me.
 * На iPhone и iPad — сразу t.me: она сама открывает приложение (см. isAppleMobile).
 *
 * На компьютере текст в ссылку не кладём (приложение покажет «%D0%9D…»):
 * чат открывается пустым, а текст копируется — его остаётся вставить.
 * Возвращает true, если текст нужно вставить вручную.
 */
export function openTelegram(link: TelegramLink, { silent = false }: OpenOptions = {}): boolean {
  if (onAppleMobile()) {
    window.location.href = link.web;
    return false;
  }
  const desktop = isDesktopDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const paste = desktop && !!link.text;
  const target = paste ? link.plain : link;

  if (paste && link.text) {
    void copyText(link.text).then((ok) => {
      if (silent) return;
      showToast(
        ok
          ? "Текст сообщения скопирован — вставьте его в чат (⌘V или Ctrl+V)"
          : "Откроем чат с менеджером — напишите, что вас интересует",
      );
    });
  }

  let left = false;
  const markLeft = () => {
    left = true;
  };
  window.addEventListener("blur", markLeft, { once: true });
  window.addEventListener("pagehide", markLeft, { once: true });
  window.location.href = target.app;
  window.setTimeout(() => {
    window.removeEventListener("blur", markLeft);
    window.removeEventListener("pagehide", markLeft);
    if (!left && document.visibilityState === "visible") window.location.href = target.web;
  }, FALLBACK_DELAY_MS);
  return paste;
}

interface TelegramAnchorProps {
  link: TelegramLink;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

/**
 * Ссылка на чат с менеджером. Адрес — https://t.me/… (на iPhone по нажатию сразу открывается
 * приложение, и ссылка работает, даже если скрипты сайта не загрузились); на остальных
 * устройствах нажатие идёт через openTelegram.
 */
export function TelegramAnchor({ link, className, children, ...rest }: TelegramAnchorProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (onAppleMobile()) return; // обычный переход по t.me — самый надёжный способ на iOS
    event.preventDefault();
    openTelegram(link);
  };
  return (
    <a href={link.web} onClick={onClick} className={className} rel="noopener" {...rest}>
      {children}
    </a>
  );
}

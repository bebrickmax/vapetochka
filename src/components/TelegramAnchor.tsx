"use client";

import type { MouseEvent, ReactNode } from "react";
import type { TelegramLink } from "@/lib/telegram";

const FALLBACK_DELAY_MS = 1200;

/**
 * Открывает Telegram по диплинку tg://resolve. Если приложение не открылось
 * (страница не потеряла фокус), переходит на веб-версию t.me.
 */
export function openTelegram(link: TelegramLink) {
  let left = false;
  const markLeft = () => {
    left = true;
  };
  window.addEventListener("blur", markLeft, { once: true });
  window.addEventListener("pagehide", markLeft, { once: true });
  window.location.href = link.app;
  window.setTimeout(() => {
    window.removeEventListener("blur", markLeft);
    window.removeEventListener("pagehide", markLeft);
    if (!left && document.visibilityState === "visible") window.location.href = link.web;
  }, FALLBACK_DELAY_MS);
}

interface TelegramAnchorProps {
  link: TelegramLink;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function TelegramAnchor({ link, className, children, ...rest }: TelegramAnchorProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    openTelegram(link);
  };
  return (
    <a href={link.app} onClick={onClick} className={className} rel="noopener" {...rest}>
      {children}
    </a>
  );
}

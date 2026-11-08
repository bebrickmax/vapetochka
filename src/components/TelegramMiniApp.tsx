"use client";

import { useEffect } from "react";
import { launchedFromTelegram, loadTelegramWebApp } from "@/lib/telegram-webapp";

const BLACK = "#000000";

/**
 * Если сайт открыт кнопкой бота в Telegram — разворачивает его на весь экран, красит шапку
 * Telegram в цвет сайта и не даёт свайпу вниз случайно закрыть каталог при прокрутке.
 */
export function TelegramMiniApp() {
  useEffect(() => {
    if (!launchedFromTelegram()) return;
    void loadTelegramWebApp().then((app) => {
      if (!app) return;
      document.documentElement.dataset.telegram = "1";
      app.ready();
      app.expand();
      try {
        app.setHeaderColor?.(BLACK);
        app.setBackgroundColor?.(BLACK);
        app.setBottomBarColor?.(BLACK);
        if (app.isVersionAtLeast?.("7.7")) app.disableVerticalSwipes?.();
      } catch {
        // старые версии Telegram — без этих настроек
      }
    });
  }, []);
  return null;
}

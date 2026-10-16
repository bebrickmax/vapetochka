/**
 * Мгновенное обновление сайта после правок Google Таблицы.
 *
 * Установка — один раз, см. HOW_TO_UPDATE.md, шаг 4:
 *   1. Вставьте этот файл в Apps Script таблицы.
 *   2. Заполните SITE_URL и SECRET ниже.
 *   3. Выполните функцию setup() (разрешите доступ). Она поставит триггеры:
 *      — при правке таблицы (onEdit / onChange) — сайт обновится через несколько секунд;
 *      — по таймеру каждые 10 минут — подберёт всё, что прошло мимо правки.
 *
 * Скрипт один и тот же для обеих таблиц: каждая шлёт сигнал, сайт обновляет обе точки.
 */

// Адрес сайта (без / в конце).
const SITE_URL = "https://ВАШ-САЙТ.vercel.app";
// То же значение, что REVALIDATE_SECRET в Vercel.
const SECRET = "ВСТАВЬТЕ_СЮДА_СЕКРЕТ";

/** Ставит все триггеры. Повторный запуск безопасен: старые удаляются. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    const fn = t.getHandlerFunction();
    if (fn === "notifySite" || fn === "notifySiteTimer") ScriptApp.deleteTrigger(t);
  });
  const ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("notifySite").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("notifySite").forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger("notifySiteTimer").timeBased().everyMinutes(10).create();
  Logger.log("Триггеры установлены: правка, изменение структуры и раз в 10 минут.");
}

/** Вызывается при правке таблицы. Не чаще раза в 15 секунд: серия правок — один запрос. */
function notifySite() {
  if (!trySend_()) return;
  // Сайт сам подождёт секунду и обновит витрину; если серия правок ещё идёт, таймер догонит.
}

/** Вызывается по таймеру каждые 10 минут — ничего не пропустит, даже если правки шли без триггера. */
function notifySiteTimer() {
  send_();
}

function trySend_() {
  const cache = CacheService.getScriptCache();
  if (cache.get("vt-lock")) return false;
  cache.put("vt-lock", "1", 15);
  return send_();
}

function send_() {
  const response = UrlFetchApp.fetch(SITE_URL + "/api/revalidate", {
    method: "post",
    headers: { "x-revalidate-secret": SECRET },
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  Logger.log(code + " " + response.getContentText());
  return code === 200;
}

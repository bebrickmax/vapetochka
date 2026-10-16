/**
 * Мгновенное обновление сайта после правок Google Таблицы.
 *
 * Установка — один раз в каждой таблице, см. HOW_TO_UPDATE.md, шаг 4:
 *   1. «Расширения» → «Apps Script» → удалите всё → вставьте этот файл.
 *   2. Заполните SECRET ниже (то же, что REVALIDATE_SECRET в Vercel). 💾 Сохранить.
 *   3. Выберите функцию setup → ▶ Выполнить → разрешите доступ.
 *
 * Как работает:
 *   • правка таблицы → сигнал на сайт сразу (сайт подтянет изменения за несколько секунд);
 *   • 20 правок за 5 секунд → один сигнал сразу и один «догоняющий» в течение минуты — не 20 запросов;
 *   • сайт был занят прошлой синхронизацией или не ответил → повтор через минуту, пока не получится;
 *   • раз в 10 минут — сигнал в любом случае (подстраховка).
 *
 * Обычный onEdit(e) не может отправлять запросы (ограничение Google), поэтому setup() ставит
 * «устанавливаемые» триггеры от вашего имени. Повторный запуск setup() безопасен: старые триггеры
 * этого скрипта удаляются, копии не плодятся.
 *
 * Скрипт один и тот же для обеих таблиц: каждая шлёт сигнал, сайт обновляет обе точки.
 */

// Адрес сайта (без / в конце).
const SITE_URL = "https://vapetochka.vercel.app";
// То же значение, что REVALIDATE_SECRET в Vercel.
const SECRET = "ВСТАВЬТЕ_СЮДА_СЕКРЕТ";

/** Не чаще одного сигнала за столько секунд; правки в эти секунды уходят «догоняющим» сигналом. */
const COOLDOWN_SECONDS = 15;

const HANDLERS = ["notifySite", "onSheetChange", "flushPending", "notifySiteTimer"];

/** Ставит все триггеры. Повторный запуск безопасен. */
function setup() {
  if (SECRET.indexOf("ВСТАВЬТЕ") === 0) throw new Error("Сначала впишите SECRET (то же значение, что REVALIDATE_SECRET в Vercel) и сохраните файл.");
  const removed = removeTriggers_();
  const ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("notifySite").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("onSheetChange").forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger("flushPending").timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger("notifySiteTimer").timeBased().everyMinutes(10).create();
  PropertiesService.getScriptProperties().deleteAllProperties();
  const ok = send_("setup");
  Logger.log(
    "Триггеры установлены (старых удалено: " + removed + "): правка, изменение структуры, догоняющий раз в минуту, раз в 10 минут. " +
      (ok ? "Сайт ответил — всё работает." : "Сайт пока не ответил «ок» — проверьте SITE_URL и SECRET, ответ выше."),
  );
}

/** Убрать все триггеры этого скрипта (например, перед удалением скрипта). */
function removeTriggers() {
  Logger.log("Удалено триггеров: " + removeTriggers_());
}

/**
 * Удаляет триггеры этого скрипта: наши и «сироты» от старых версий (их функции уже нет в файле).
 * Чужие триггеры с существующими функциями не трогает.
 */
function removeTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (HANDLERS.indexOf(fn) !== -1 || typeof globalThis[fn] !== "function") {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

// ─── Триггеры ───────────────────────────────────────────────────────────────

/** Правка ячейки. */
function notifySite() {
  onEdited_();
}

/** Изменение структуры: строки/столбцы/листы добавили или удалили. Обычные правки ловит notifySite. */
function onSheetChange(e) {
  const type = e && e.changeType;
  if (type === "EDIT" || type === "FORMAT") return;
  onEdited_();
}

/** Раз в минуту: была правка после последнего удачного сигнала — шлём «догоняющий». */
function flushPending() {
  const state = takeTurn_(false);
  if (state) deliver_(state, "догоняющий");
}

/** Раз в 10 минут — в любом случае (подхватит то, что прошло мимо триггеров). */
function notifySiteTimer() {
  const state = takeTurn_(true);
  if (state) deliver_(state, "по таймеру");
}

// ─── Защита от лавины запросов ──────────────────────────────────────────────
// В свойствах скрипта: editAt — время последней правки, sentAt — последнего сигнала,
// doneAt — правки до этого момента сайт уже подтвердил. Всё меняется под блокировкой.

function onEdited_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // параллельно уже работает другой триггер — правку подхватит догоняющий
  let send = false;
  const now = Date.now();
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty("editAt", String(now));
    const sentAt = Number(props.getProperty("sentAt") || 0);
    if (now - sentAt >= COOLDOWN_SECONDS * 1000) {
      props.setProperty("sentAt", String(now));
      send = true;
    }
  } finally {
    lock.releaseLock();
  }
  if (send) deliver_({ startedAt: now }, "после правки");
}

/**
 * Решает под блокировкой, слать ли сигнал сейчас. force — по таймеру (не смотрит на правки).
 * Возвращает момент начала отправки или null.
 */
function takeTurn_(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return null;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    const editAt = Number(props.getProperty("editAt") || 0);
    const doneAt = Number(props.getProperty("doneAt") || 0);
    const sentAt = Number(props.getProperty("sentAt") || 0);
    if (!force && editAt <= doneAt) return null; // все правки уже на сайте
    if (!force && now - sentAt < COOLDOWN_SECONDS * 1000) return null; // только что слали — подождём минуту
    props.setProperty("sentAt", String(now));
    return { startedAt: now };
  } finally {
    lock.releaseLock();
  }
}

/** Отправляет сигнал; если сайт подтвердил — помечает правки до startedAt как доставленные. */
function deliver_(state, reason) {
  if (!send_(reason)) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    // Сайт читает таблицу уже после начала запроса: всё, что правили до startedAt, он увидел.
    if (Number(props.getProperty("doneAt") || 0) < state.startedAt) props.setProperty("doneAt", String(state.startedAt));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Сигнал сайту. true — сайт синхронизировал таблицу. false — не ответил, ошибся или был занят
 * прошлой синхронизацией (тогда догоняющий сигнал повторит через минуту).
 */
function send_(reason) {
  try {
    const response = UrlFetchApp.fetch(SITE_URL + "/api/revalidate", {
      method: "post",
      headers: { "x-revalidate-secret": SECRET },
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    const text = response.getContentText();
    Logger.log("[" + reason + "] " + code + " " + text);
    if (code !== 200) return false;
    let body = {};
    try {
      body = JSON.parse(text);
    } catch (e) {
      return false;
    }
    const synced = body.synced || [];
    return body.ok === true && !synced.some(function (r) { return r.skipped || r.error; });
  } catch (error) {
    Logger.log("[" + reason + "] сайт не ответил: " + error);
    return false;
  }
}

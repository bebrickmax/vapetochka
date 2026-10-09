/**
 * Мгновенное обновление сайта после правки Google Таблицы.
 * Как установить — см. HOW_TO_UPDATE.md, шаг 4.
 */

// Адрес вашего сайта (без слеша в конце)
const SITE_URL = "https://ВАШ-САЙТ.vercel.app";
// То же значение, что REVALIDATE_SECRET в настройках сайта
const SECRET = "ВСТАВЬТЕ_СЮДА_СЕКРЕТ";

function notifySite() {
  // Не чаще одного раза в 15 секунд, чтобы не дёргать сайт на каждую букву.
  const cache = CacheService.getScriptCache();
  if (cache.get("vt-lock")) return;
  cache.put("vt-lock", "1", 15);

  const response = UrlFetchApp.fetch(SITE_URL + "/api/revalidate", {
    method: "post",
    headers: { "x-revalidate-secret": SECRET },
    muteHttpExceptions: true,
  });
  console.log(response.getResponseCode() + " " + response.getContentText());
}

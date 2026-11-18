import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { cacheConfig, siteUrl, storeTags } from "@/config/site";
import { warmStorefront } from "@/lib/admin/api";
import { backupIfDue, refreshCatalog, type RefreshResult } from "@/lib/refresh";
import { ensureBotSetup, isBotConfigured } from "@/lib/telegram-bot";

/** Синхронизация с таблицей и фото — с запасом по времени. */
export const maxDuration = 300;

/**
 * Обновление сайта из Google Таблицы — без ожидания посетителей. Его вызывают:
 *  • Google Apps Script — сразу после правки таблицы и по таймеру (google-apps-script/auto-update.gs);
 *  • расписание в Supabase раз в 10 минут (supabase/cron.sql);
 *  • вручную: https://ваш-сайт/api/revalidate?secret=ВАШ_СЕКРЕТ
 *
 * Сигнал дешёвый, если ничего не менялось: скачиваются только значения таблиц и сверяются с тем, что уже
 * на витрине или в базе (src/lib/refresh.ts). Изменилась таблица точки — база синхронизируется, витрина
 * этой точки пересобирается в фоне (страницу открывает сам сайт — покупатели старую версию не ловят),
 * раз в сутки сохраняется резервная копия базы.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-revalidate-secret") ?? request.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Сброс кэша точек, где что-то изменилось. */
function revalidateStores(result: RefreshResult): string[] {
  if (result.mode === "legacy") {
    // Старая схема базы — как раньше: всё сразу.
    revalidateTag(cacheConfig.sheetsTag, { expire: 0 });
    revalidateTag(cacheConfig.wholesaleTag, "max");
    revalidateTag(cacheConfig.tag, "max");
    return result.stores.map((s) => s.storeId);
  }
  const changed = result.stores.filter((s) => s.changed && !s.error).map((s) => s.storeId);
  for (const storeId of changed) {
    const tags = storeTags(storeId);
    // Таблица точно прочиталась и синхронизировалась — жёсткий сброс: витрина соберётся из свежих данных.
    revalidateTag(tags.sheets, { expire: 0 });
    revalidateTag(tags.wholesale, { expire: 0 });
    revalidateTag(tags.catalog, "max");
  }
  return changed;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, message: "Неверный или не настроенный секрет" }, { status: 401 });
  }

  let result: RefreshResult;
  try {
    result = await refreshCatalog(new URL(request.url).origin);
  } catch (error) {
    console.error("[revalidate] Настройки точек не прочитались:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { ok: false, message: "База не ответила — прежняя витрина оставлена", synced: [{ storeId: "*", error: message }] },
      { status: 503 },
    );
  }

  const changed = revalidateStores(result);
  warmStorefront(request, changed);

  // Telegram-бот: как только в Vercel появился TELEGRAM_BOT_TOKEN, бот сам подключается к сайту
  // (вебхук, кнопка «Каталог») при ближайшем автообновлении. Только в проде — превью не перехватят бота.
  if (isBotConfigured() && process.env.VERCEL_ENV === "production") {
    after(async () => {
      const setUp = await ensureBotSetup(siteUrl).catch((error) => console.error("[revalidate] Бот не подключился:", error));
      if (setUp) console.log("[revalidate] Telegram-бот подключён к сайту");
    });
  }

  // Резервная копия раз в сутки (первый сигнал после полуночи по Минску).
  if (result.mode === "db") {
    const { state } = result;
    after(async () => {
      const saved = await backupIfDue(state).catch((error) => console.error("[revalidate] Резервная копия не сохранилась:", error));
      if (saved) console.log(`[revalidate] Резервная копия: ${saved}`);
    });
  }

  const failed = result.stores.some((s) => s.error);
  const message = failed
    ? "Не все точки обновились — у них оставлена прежняя витрина"
    : changed.length > 0
      ? "Каталог обновлён"
      : "Изменений нет — витрина актуальна";
  return Response.json(
    {
      ok: !failed,
      message,
      synced: result.stores.map((r) => ({
        storeId: r.storeId,
        changed: r.changed,
        ...(r.unchanged && { unchanged: true }),
        ...(r.report && { photosPending: r.report.photos.pending }),
        ...(r.skipped && { skipped: true }),
        ...(r.error && { error: r.error }),
      })),
    },
    { status: failed ? 503 : 200 },
  );
}

export const GET = handle;
export const POST = handle;

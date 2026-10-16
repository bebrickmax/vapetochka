import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { cacheConfig } from "@/config/site";
import { warmStorefront } from "@/lib/admin/api";
import { saveDailyBackup } from "@/lib/db/backup";
import { isDbConfigured } from "@/lib/db/supabase";
import { syncAll } from "@/lib/db/sync";

/** Синхронизация обеих точек с таблицей и фото — с запасом по времени. */
export const maxDuration = 300;

/**
 * Обновление сайта из Google Таблицы — без ожидания посетителей. Его вызывают:
 *  • Google Apps Script — сразу после правки таблицы и по таймеру (google-apps-script/auto-update.gs);
 *  • расписание в Supabase раз в 10 минут (supabase/cron.sql) — заодно база не «засыпает»;
 *  • вручную: https://ваш-сайт/api/revalidate?secret=ВАШ_СЕКРЕТ
 *
 * Точки «от таблицы» сразу синхронизируются с таблицей, затем витрина пересобирается в фоне
 * (страницы точек открывает сам сайт — покупатели старую версию не ловят), раз в сутки
 * сохраняется резервная копия базы.
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

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, message: "Неверный или не настроенный секрет" }, { status: 401 });
  }

  // 1. База — сразу как в таблице, чтобы витрина собралась уже из свежей базы.
  const synced = isDbConfigured()
    ? await syncAll({ maxPhotos: 20, photoSeconds: 20 }).catch((error) => {
        console.error("[revalidate] Синхронизация не удалась:", error);
        return [{ storeId: "*", error: error instanceof Error ? error.message : String(error) }];
      })
    : [];

  // 2. Кэш витрины. Жёсткий сброс (expire: 0) — только после удачной синхронизации: иначе покупатель,
  //    пришедший во время сбоя Google или базы, увидел бы страницу ошибки. При сбое — мягкий сброс:
  //    прежняя витрина остаётся до следующей удачной пересборки.
  const failed = synced.some((r) => "error" in r && r.error);
  if (failed) {
    revalidateTag(cacheConfig.sheetsTag, "max");
    revalidateTag(cacheConfig.wholesaleTag, "max");
    revalidateTag(cacheConfig.tag, "max");
  } else {
    revalidateTag(cacheConfig.sheetsTag, { expire: 0 });
    revalidateTag(cacheConfig.wholesaleTag, "max");
    revalidateTag(cacheConfig.tag, "max");
  }
  warmStorefront(request);

  // 3. Резервная копия раз в сутки (первый вызов после полуночи по Минску).
  if (isDbConfigured()) {
    after(async () => {
      const saved = await saveDailyBackup().catch((error) => console.error("[revalidate] Резервная копия не сохранилась:", error));
      if (saved) console.log(`[revalidate] Резервная копия: ${saved}`);
    });
  }

  return Response.json(
    {
    ok: !failed,
    message: failed ? "Синхронизация не удалась — прежняя витрина оставлена" : "Каталог обновлён",
    synced: synced.map((r) => ({
      storeId: r.storeId,
      ...("report" in r && r.report && { changed: r.report.changed, photosPending: r.report.photos.pending }),
      ...("skipped" in r && r.skipped && { skipped: true }),
      ...("error" in r && r.error && { error: r.error }),
    })),
  },
    { status: failed ? 503 : 200 },
  );
}

export const GET = handle;
export const POST = handle;

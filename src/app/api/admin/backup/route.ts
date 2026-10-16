import { adminRoute } from "@/lib/admin/api";
import { backupDay, makeBackup } from "@/lib/db/backup";

/** Резервная копия всего каталога одним файлом JSON (скачивается из меню админки). */
export const GET = adminRoute(
  async () => {
    const now = new Date();
    const backup = await makeBackup(now);
    return new Response(JSON.stringify(backup), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vapetochka-${backupDay(now)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { mutates: false },
);

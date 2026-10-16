import { gzipSync } from "node:zlib";
import { storeInfos } from "@/config/stores";
import { siteConfig } from "@/config/site";
import { loadSnapshot } from "./catalog";
import { DbError, selectAll, storageList, storageRemove, storageUpload } from "./supabase";
import type { DbSnapshot } from "./types";

/*
 * Резервные копии каталога: весь снимок базы (категории, линейки, вкусы, наличие и цены по точкам,
 * режимы точек) одним JSON. Удаление в базе окончательное — по копии можно вернуть что угодно.
 *  • вручную — кнопка в админке (/api/admin/backup);
 *  • автоматически — раз в сутки при плановом обновлении (/api/revalidate), в закрытый бакет backups,
 *    последние KEEP_DAYS копий.
 */

export const BACKUP_BUCKET = "backups";
const KEEP_DAYS = 30;

export interface Backup {
  format: "vapetochka-backup";
  version: 1;
  createdAt: string;
  stores: { id: string; title: string }[];
  snapshot: DbSnapshot;
  /** Режимы точек и время синхронизации (null — таблицы настроек нет). */
  settings: Record<string, unknown>[] | null;
  /** Быстрые правки поверх таблицы (старая схема), если они есть. */
  overrides: Record<string, unknown>[] | null;
}

/** Таблица может отсутствовать в старой схеме — тогда null. */
async function optionalTable(table: string): Promise<Record<string, unknown>[] | null> {
  try {
    return await selectAll<Record<string, unknown>>(table);
  } catch (error) {
    if (error instanceof DbError && error.status === 404) return null;
    throw error;
  }
}

export async function makeBackup(now = new Date()): Promise<Backup> {
  const [snapshot, settings, overrides] = await Promise.all([loadSnapshot(), optionalTable("store_settings"), optionalTable("sheet_overrides")]);
  return {
    format: "vapetochka-backup",
    version: 1,
    createdAt: now.toISOString(),
    stores: storeInfos.map(({ id, title }) => ({ id, title })),
    snapshot,
    settings,
    overrides,
  };
}

/** «2026-10-16» по времени магазина — по одному файлу в сутки. */
export function backupDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: siteConfig.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const backupFileName = (now: Date) => `vapetochka-${backupDay(now)}.json.gz`;

/**
 * Копия за сегодня, если её ещё нет; старше KEEP_DAYS — удаляются.
 * null — сегодняшняя копия уже есть.
 */
export async function saveDailyBackup(now = new Date()): Promise<string | null> {
  const name = backupFileName(now);
  const existing = await storageList(BACKUP_BUCKET, 200);
  if (existing.includes(name)) return null;
  const json = JSON.stringify(await makeBackup(now));
  await storageUpload(BACKUP_BUCKET, name, gzipSync(json), "application/gzip");
  const old = [...existing, name]
    .filter((n) => /^vapetochka-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n))
    .sort()
    .reverse()
    .slice(KEEP_DAYS);
  await storageRemove(BACKUP_BUCKET, old);
  return name;
}

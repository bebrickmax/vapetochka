import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDbConfigured, storageDownload, storageUpload } from "@/lib/db/supabase";
import { loadSettings, markSynced, syncStore, type SettingsState, type StoreSettings, type SyncReport, type SyncResult } from "@/lib/db/sync";
import { fetchStoreRows, withSheetImages, type StoreRows } from "@/lib/sheets/sources";
import { CATALOG_VERSION_META, sheetsVersion } from "@/lib/sheets/version";
import { refreshCatalog } from "./refresh";

/*
 * Экономное автообновление: если таблица не менялась, сигнал не качает фото, не трогает базу
 * и не пересобирает витрину. Google, база и хранилище здесь подменены.
 */

vi.mock("@/lib/sheets/sources", () => ({
  fetchStoreRows: vi.fn(),
  withSheetImages: vi.fn(async (_store: unknown, data: StoreRows) => ({ ...data, sheets: data.sheets.map((s) => ({ ...s, images: {} })) })),
}));

vi.mock("@/lib/db/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/supabase")>()),
  isDbConfigured: vi.fn(() => false),
  storageDownload: vi.fn(async () => null),
  storageUpload: vi.fn(async () => {}),
}));

vi.mock("@/lib/db/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/sync")>()),
  loadSettings: vi.fn(),
  markSynced: vi.fn(async () => {}),
  syncStore: vi.fn(),
}));

const ORIGIN = "https://shop.test";
const NOW = Date.parse("2026-11-18T10:00:00Z");

/** Таблица точки: price меняет цену — значит, и версию. */
const rowsFor = (price = "15 BYN"): StoreRows => ({
  sheets: [{ title: "Жидкости", gid: "1", rows: [["Husky 20mg"], [price], ["", "Банан", "✅"]] }],
});

let tables: Record<string, StoreRows>;
let pages: Record<string, string | null>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  tables = { main: rowsFor(), "kamennaya-gorka": rowsFor("16 BYN") };
  pages = {};
  vi.mocked(fetchStoreRows).mockImplementation(async (store) => {
    const rows = tables[store.id];
    if (!rows) throw new Error("Google не ответил");
    return rows;
  });
  // Страницы точек на сайте: версия таблицы в <meta>, null — страница недоступна.
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const version = pages[url.pathname.slice(1)];
    if (url.origin !== ORIGIN || version === null) return new Response("nope", { status: 500 });
    const meta = version ? `<meta name="${CATALOG_VERSION_META}" content="${version}"/>` : "";
    return new Response(`<html><head>${meta}</head><body>каталог</body></html>`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.clearAllMocks();
  vi.mocked(isDbConfigured).mockReturnValue(false);
  vi.mocked(storageDownload).mockResolvedValue(null);
});

const byStore = (stores: { storeId: string }[]) => Object.fromEntries(stores.map((s) => [s.storeId, s]));

describe("база на паузе: сверка таблицы со страницей точки", () => {
  it("таблица та же, что на витрине, — ничего не пересобираем и фото не качаем", async () => {
    pages = { main: sheetsVersion(tables.main), "kamennaya-gorka": sheetsVersion(tables["kamennaya-gorka"]) };
    const result = await refreshCatalog(ORIGIN, NOW);
    expect(result.mode).toBe("sheets");
    expect(result.stores.map((s) => [s.storeId, s.changed, s.unchanged])).toEqual([
      ["main", false, true],
      ["kamennaya-gorka", false, true],
    ]);
    expect(withSheetImages).not.toHaveBeenCalled();
  });

  it("изменилась одна таблица — пересобирается только её точка", async () => {
    pages = { main: sheetsVersion(tables.main), "kamennaya-gorka": sheetsVersion(tables["kamennaya-gorka"]) };
    tables.main = rowsFor("14 BYN");
    const stores = byStore((await refreshCatalog(ORIGIN, NOW)).stores);
    expect(stores.main).toMatchObject({ changed: true });
    expect(stores["kamennaya-gorka"]).toMatchObject({ changed: false, unchanged: true });
  });

  it("версию страницы не узнать (страница старая или недоступна) — пересобираем, как раньше", async () => {
    pages = { main: "", "kamennaya-gorka": null };
    const result = await refreshCatalog(ORIGIN, NOW);
    expect(result.stores.every((s) => s.changed)).toBe(true);
  });

  it("Google не ответил — ошибка этой точки, витрина остаётся прежней", async () => {
    pages = { main: sheetsVersion(tables.main), "kamennaya-gorka": "old" };
    delete tables["kamennaya-gorka"];
    const stores = byStore((await refreshCatalog(ORIGIN, NOW)).stores);
    expect(stores["kamennaya-gorka"]).toMatchObject({ changed: false, error: "Google не ответил" });
    expect(stores.main).toMatchObject({ changed: false, unchanged: true });
  });
});

// ─── База работает ──────────────────────────────────────────────────────────

const settings = (sources: Record<string, "sheet" | "db"> = {}): SettingsState => ({
  rows: new Map(
    ["main", "kamennaya-gorka"].map((id): [string, StoreSettings] => [
      id,
      { store_id: id, source: sources[id] ?? "sheet", synced_at: "2026-11-18T09:00:00Z" },
    ]),
  ),
  mirror: true,
});

const report = (patch: Partial<SyncReport> = {}): SyncReport => ({
  storeId: "main",
  lines: { created: 0, updated: 0, removed: 0 },
  items: { created: 0, updated: 0, removed: 0 },
  stock: { added: 0, updated: 0, removed: 0, removalSkipped: false },
  photos: { copied: 0, failed: 0, pending: 0 },
  first: false,
  changed: false,
  ...patch,
});

const synced = (patch: Partial<SyncReport> = {}): SyncResult => ({ report: report(patch), sheets: { sheets: [] }, snapshot: null });

/** Состояние «база синхронизирована с текущими таблицами» на момент at. */
function savedState(at: string, extra: Record<string, object> = {}) {
  const stores = Object.fromEntries(
    Object.entries(tables).map(([id, rows]) => [id, { version: sheetsVersion(rows), source: "sheet", fullAt: at, ...extra[id] }]),
  );
  vi.mocked(storageDownload).mockResolvedValue(JSON.stringify({ stores }));
}

const savedJson = () => {
  const call = vi.mocked(storageUpload).mock.calls.at(-1);
  return call ? JSON.parse(new TextDecoder().decode(call[2] as Uint8Array)) : null;
};

describe("база работает: сверка с последней синхронизацией", () => {
  beforeEach(() => {
    vi.mocked(isDbConfigured).mockReturnValue(true);
    vi.mocked(loadSettings).mockResolvedValue(settings());
    vi.mocked(syncStore).mockResolvedValue(synced());
  });

  it("первый раз (состояния нет) — синхронизирует уже скачанную таблицу и запоминает её версию", async () => {
    const result = await refreshCatalog(ORIGIN, NOW);
    expect(result.mode).toBe("db");
    expect(syncStore).toHaveBeenCalledTimes(2);
    expect(vi.mocked(syncStore).mock.calls[0][1]).toMatchObject({ sheets: { sheets: [{ title: "Жидкости", images: {} }] } });
    expect(savedJson().stores.main).toEqual({ version: sheetsVersion(tables.main), source: "sheet", fullAt: new Date(NOW).toISOString() });
    // Таблицы новые для сигнала — витрины пересобираются.
    expect(result.stores.every((s) => s.changed)).toBe(true);
  });

  it("таблицы не менялись — база не синхронизируется, только отмечается время проверки", async () => {
    savedState("2026-11-18T08:00:00Z");
    const result = await refreshCatalog(ORIGIN, NOW);
    expect(syncStore).not.toHaveBeenCalled();
    expect(withSheetImages).not.toHaveBeenCalled();
    expect(markSynced).toHaveBeenCalledTimes(2);
    expect(storageUpload).not.toHaveBeenCalled();
    expect(result.stores.every((s) => s.unchanged && !s.changed)).toBe(true);
  });

  it("изменилась одна таблица — синхронизируется только она", async () => {
    savedState("2026-11-18T08:00:00Z");
    tables["kamennaya-gorka"] = rowsFor("17 BYN");
    vi.mocked(syncStore).mockResolvedValue(synced({ changed: true }));
    const stores = byStore((await refreshCatalog(ORIGIN, NOW)).stores);
    expect(vi.mocked(syncStore).mock.calls.map((c) => c[0])).toEqual(["kamennaya-gorka"]);
    expect(stores["kamennaya-gorka"]).toMatchObject({ changed: true });
    expect(stores.main).toMatchObject({ changed: false, unchanged: true });
    expect(savedJson().stores["kamennaya-gorka"].version).toBe(sheetsVersion(tables["kamennaya-gorka"]));
  });

  it("раз в 6 часов — полная синхронизация, но витрина пересобирается, только если база изменилась", async () => {
    savedState("2026-11-18T03:00:00Z");
    const result = await refreshCatalog(ORIGIN, NOW);
    expect(syncStore).toHaveBeenCalledTimes(2);
    expect(result.stores.some((s) => s.changed)).toBe(false);
  });

  it("фото остались в очереди — в следующий раз синхронизирует снова", async () => {
    savedState("2026-11-18T08:00:00Z", { main: { retry: true } });
    vi.mocked(syncStore).mockResolvedValue(synced({ photos: { copied: 20, failed: 0, pending: 5 } }));
    await refreshCatalog(ORIGIN, NOW);
    expect(vi.mocked(syncStore).mock.calls.map((c) => c[0])).toEqual(["main"]);
    expect(savedJson().stores.main.retry).toBe(true);
  });

  it("синхронизация уже идёт — точка пропущена (Apps Script повторит), версия не запоминается", async () => {
    vi.mocked(syncStore).mockResolvedValue(null);
    const result = await refreshCatalog(ORIGIN, NOW);
    expect(result.stores.every((s) => s.skipped && !s.changed)).toBe(true);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("точка «от админки» — база не синхронизируется, витрина пересобирается только при изменении таблицы (ОПТ)", async () => {
    vi.mocked(loadSettings).mockResolvedValue(settings({ main: "db", "kamennaya-gorka": "db" }));
    vi.mocked(storageDownload).mockResolvedValue(
      JSON.stringify({ stores: { main: { version: sheetsVersion(tables.main), source: "db", fullAt: "2026-11-01T00:00:00Z" } } }),
    );
    const stores = byStore((await refreshCatalog(ORIGIN, NOW)).stores);
    expect(syncStore).not.toHaveBeenCalled();
    expect(stores.main).toMatchObject({ changed: false, unchanged: true });
    expect(stores["kamennaya-gorka"]).toMatchObject({ changed: true });
  });

  it("испорченный файл состояния — просто синхронизирует целиком", async () => {
    vi.mocked(storageDownload).mockResolvedValue("{не json");
    await refreshCatalog(ORIGIN, NOW);
    expect(syncStore).toHaveBeenCalledTimes(2);
  });
});

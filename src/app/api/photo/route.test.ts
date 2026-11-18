import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// Вне Next.js кэш-функции не работают — здесь они не нужны.
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const PROJECT = "https://abcd1234.supabase.co";
const PHOTO = `${PROJECT}/storage/v1/object/public/photos/uploads/123-abc.png`;

const get = (params: Record<string, string>) =>
  GET(new NextRequest(`https://vapetochka.test/api/photo?${new URLSearchParams(params)}`));

describe("/api/photo — фото из хранилища", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", PROJECT);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("уменьшает большое фото до размера карточки (JPEG на белом)", async () => {
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await get({ u: PHOTO, s: "360" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([360, 240]);
    expect(fetchMock).toHaveBeenCalledWith(PHOTO, expect.anything());
  });

  it("фото другого проекта не скачивает, а отправляет по ссылке", async () => {
    const other = "https://other.supabase.co/storage/v1/object/public/photos/a.jpg";
    const res = await get({ u: other, s: "360" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(other);
  });

  it("отказывает чужим адресам и размерам", async () => {
    expect((await get({ u: "https://evil.example/x.jpg", s: "360" })).status).toBe(404);
    expect((await get({ u: PHOTO, s: "999" })).status).toBe(404);
  });
});

describe("/api/photo — фото из Google Таблицы по постоянному адресу", () => {
  const TOKEN = "ADdU-aw" + "a".repeat(40);
  const ROTATED = "ADdU-aw" + "b".repeat(40);
  /** Веб-просмотр листа: в строке 3 картинка с текущей ссылкой Google. */
  const sheetHtml = (token: string) =>
    `<table><tr><th id="0R3">4</th><td><img src="https://docs.google.com/sheets-images-rt/${token}=w100-h50"></td><td>Банан</td></tr></table>`;

  afterEach(() => vi.unstubAllGlobals());

  it("находит свежую ссылку по листу и строке; CDN хранит фото сутки", async () => {
    let current = TOKEN;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/htmlview/sheet")) return new Response(sheetHtml(current));
      if (url.includes(`/sheets-images-rt/${current}=s360`)) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      return new Response("expired", { status: 403, headers: { "content-type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await get({ store: "main", gid: "618442738", row: "3", k: "abc12", s: "360" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    // Google сменил ссылку, а в памяти старая — сайт спрашивает Google заново.
    current = ROTATED;
    const again = await get({ store: "main", gid: "618442738", row: "3", k: "abc12", s: "360" });
    expect(again.status).toBe(200);
  });

  it("в строке нет фото или адрес чужой — 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sheetHtml(TOKEN))));
    expect((await get({ store: "main", gid: "618442738", row: "7", k: "abc12", s: "360" })).status).toBe(404);
    expect((await get({ store: "main", gid: "618442738", row: "3", k: "НЕ-ТО", s: "360" })).status).toBe(404);
    expect((await get({ store: "nope", gid: "618442738", row: "3", k: "abc12", s: "360" })).status).toBe(404);
  });
});

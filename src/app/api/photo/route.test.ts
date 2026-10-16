import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

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

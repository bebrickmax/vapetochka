import { describe, expect, it } from "vitest";
import { imageToken, photoPath, proxyImages, sizedPhoto } from "./photos";

const GOOGLE = "https://docs.google.com/u/0/sheets-images-rt/AO43MLabc_DEF-ghi1234567890";

describe("photos", () => {
  it("extracts the image token", () => {
    expect(imageToken(GOOGLE)).toBe("AO43MLabc_DEF-ghi1234567890");
    expect(imageToken("https://example.com/x.png")).toBeNull();
  });

  it("builds site photo paths with store, sheet and row", () => {
    expect(photoPath("kamennaya-gorka", "618442738", 71, GOOGLE)).toBe(
      "/api/photo?store=kamennaya-gorka&gid=618442738&row=71&t=AO43MLabc_DEF-ghi1234567890",
    );
    expect(proxyImages("main", "1", { 3: GOOGLE, 4: "https://bad" })).toEqual({
      3: "/api/photo?store=main&gid=1&row=3&t=AO43MLabc_DEF-ghi1234567890",
    });
    expect(proxyImages("main", undefined, { 3: GOOGLE })).toEqual({});
  });

  it("rounds sizes up to the allowed ones", () => {
    expect(sizedPhoto("/api/photo?store=main&gid=1&row=3&t=x", 300)).toBe("/api/photo?store=main&gid=1&row=3&t=x&s=360");
    expect(sizedPhoto("/api/photo?t=x", 5000)).toBe("/api/photo?t=x&s=1200");
    expect(sizedPhoto("https://abc.supabase.co/storage/v1/object/public/photos/a.jpg", 360)).toBe(
      "https://abc.supabase.co/storage/v1/object/public/photos/a.jpg",
    );
  });
});

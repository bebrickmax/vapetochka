import { describe, expect, it } from "vitest";
import { imageToken, photoPath, proxyImages, ROW_KEY_RE, rowKey, sizedPhoto } from "./photos";

const GOOGLE = "https://docs.google.com/u/0/sheets-images-rt/AO43MLabc_DEF-ghi1234567890";

describe("photos", () => {
  it("extracts the image token", () => {
    expect(imageToken(GOOGLE)).toBe("AO43MLabc_DEF-ghi1234567890");
    expect(imageToken("https://example.com/x.png")).toBeNull();
  });

  it("builds stable site photo paths: store, sheet, row and a row fingerprint — no Google token", () => {
    expect(photoPath("kamennaya-gorka", "618442738", 71, "abc12")).toBe(
      "/api/photo?store=kamennaya-gorka&gid=618442738&row=71&k=abc12",
    );
    const rows = [["Husky 20mg"], ["15 BYN"], ["", "Банан", "✅"], ["", "Арбуз", "✅"], ["x"]];
    const paths = proxyImages("main", "1", { 3: GOOGLE, 4: "https://bad" }, rows);
    expect(Object.keys(paths)).toEqual(["3"]);
    expect(paths[3]).toBe(`/api/photo?store=main&gid=1&row=3&k=${rowKey(rows[3])}`);
    expect(proxyImages("main", undefined, { 3: GOOGLE })).toEqual({});
  });

  it("the address survives Google rotating its image links, but changes with the row", () => {
    const rows = [["", "Банан", "✅"]];
    const before = proxyImages("main", "1", { 0: GOOGLE }, rows);
    const rotated = proxyImages("main", "1", { 0: `${GOOGLE.slice(0, -5)}ZZZZZ` }, rows);
    expect(rotated).toEqual(before);
    expect(proxyImages("main", "1", { 0: GOOGLE }, [["", "Банан", "❌"]])).not.toEqual(before);
    expect(rowKey(rows[0])).toMatch(ROW_KEY_RE);
    expect(rowKey(undefined)).toMatch(ROW_KEY_RE);
  });

  it("rounds sizes up to the allowed ones", () => {
    expect(sizedPhoto("/api/photo?store=main&gid=1&row=3&t=x", 300)).toBe("/api/photo?store=main&gid=1&row=3&t=x&s=360");
    expect(sizedPhoto("/api/photo?t=x", 5000)).toBe("/api/photo?t=x&s=1200");
    expect(sizedPhoto("https://example.com/a.jpg", 360)).toBe("https://example.com/a.jpg");
  });

  it("serves storage photos resized through the site", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/photos/import/AbC_12-x.png";
    expect(sizedPhoto(url, 300)).toBe(`/api/photo?u=${encodeURIComponent(url)}&s=360`);
    expect(sizedPhoto("https://abc.supabase.co/storage/v1/object/public/other/a.jpg", 360)).toBe(
      "https://abc.supabase.co/storage/v1/object/public/other/a.jpg",
    );
  });
});

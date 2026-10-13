import { describe, expect, it } from "vitest";
import { authHeaders } from "./supabase";

describe("authHeaders", () => {
  it("новый секретный ключ — только в apikey", () => {
    expect(authHeaders("sb_secret_abc")).toEqual({ apikey: "sb_secret_abc" });
  });
  it("старый service_role (JWT) — ещё и в Authorization", () => {
    expect(authHeaders("eyJhbGciOi.x.y")).toEqual({ apikey: "eyJhbGciOi.x.y", Authorization: "Bearer eyJhbGciOi.x.y" });
  });
});

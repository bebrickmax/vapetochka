import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, isAuthorized, verifySessionToken } from "./auth";

describe("admin auth", () => {
  it("checks the password and signs sessions", () => {
    process.env.ADMIN_PASSWORD = "секрет-1234";
    expect(checkPassword("секрет-1234")).toBe(true);
    expect(checkPassword("секрет-123")).toBe(false);
    expect(checkPassword("")).toBe(false);

    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now)).toBe(true);
    expect(verifySessionToken(token, now + 31 * 24 * 3600 * 1000)).toBe(false); // истёк
    expect(verifySessionToken(token.replace(/.$/, "x"), now)).toBe(false); // подделка
    expect(verifySessionToken(`${now + 9e12}.${token.split(".")[1]}`, now)).toBe(false); // чужой срок

    const request = new Request("https://x/api", { headers: { cookie: `a=1; vt_admin=${token}` } });
    expect(isAuthorized(request)).toBe(true);

    process.env.ADMIN_PASSWORD = "другой-пароль"; // сменили пароль — старые сессии не действуют
    expect(verifySessionToken(token, now)).toBe(false);
  });

  it("is closed without ADMIN_PASSWORD", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(checkPassword("")).toBe(false);
    expect(verifySessionToken("1.2")).toBe(false);
  });
});

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { POST as orderRoute } from "@/app/api/telegram/order/route";
import { POST as webhookRoute } from "@/app/api/telegram/route";
import { botReplies, catalogKeyboard, orderMessages, verifyInitData, webhookSecret } from "./telegram-bot";

const TOKEN = "123456:TEST-token_abcdefghijklmnopqrstuv";
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

/** initData, подписанные так же, как это делает Telegram. */
function signedInitData(fields: Record<string, string>, token = TOKEN): string {
  const check = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = { id: 42, first_name: "Иван", username: "ivan_buyer" };
const fresh = () => signedInitData({ auth_date: String(NOW / 1000 - 60), query_id: "AAE", user: JSON.stringify(user) });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_ORDERS_CHAT_ID;
});

/** Подменяет Telegram API и запоминает, что бот отправил. */
function fakeTelegram() {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.telegram.org/")) return new Response("nope", { status: 500 });
    calls.push({ method: url.split("/").pop()!, body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json({ ok: true, result: {} });
  }) as typeof fetch;
  return calls;
}

describe("подпись данных Mini App", () => {
  it("принимает данные, подписанные Telegram, и возвращает покупателя", () => {
    expect(verifyInitData(fresh(), TOKEN, 24 * 3600, NOW)).toEqual(user);
  });

  it("отклоняет подделку, чужой токен и устаревшие данные", () => {
    const tampered = fresh().replace("ivan_buyer", "hacker");
    expect(verifyInitData(tampered, TOKEN, 24 * 3600, NOW)).toBeNull();
    expect(verifyInitData(fresh(), "999:another-token-xxxxxxxxxxxxxxxx", 24 * 3600, NOW)).toBeNull();
    const old = signedInitData({ auth_date: String(NOW / 1000 - 3 * 24 * 3600), user: JSON.stringify(user) });
    expect(verifyInitData(old, TOKEN, 24 * 3600, NOW)).toBeNull();
    expect(verifyInitData("", TOKEN)).toBeNull();
  });
});

describe("ответы бота", () => {
  it("на /start присылает приветствие и кнопки каталога каждой точки", () => {
    const [reply] = botReplies({ message: { text: "/start", chat: { id: 7, type: "private" } } }, "https://shop.example");
    expect(reply).toMatchObject({ chat_id: 7, reply_markup: catalogKeyboard("https://shop.example") });
    const buttons = catalogKeyboard("https://shop.example").inline_keyboard.flat();
    expect(buttons).toContainEqual(expect.objectContaining({ web_app: { url: "https://shop.example/main" } }));
    expect(buttons).toContainEqual(expect.objectContaining({ web_app: { url: "https://shop.example/kamennaya-gorka" } }));
  });

  it("на /id говорит ID чата (и в группе), на обычные сообщения в группе молчит", () => {
    const [reply] = botReplies({ message: { text: "/id@vapetochka_bot", chat: { id: -100500, type: "supergroup" } } }, "https://x");
    expect(reply).toMatchObject({ chat_id: -100500 });
    expect(JSON.stringify(reply)).toContain("-100500");
    expect(botReplies({ message: { text: "привет", chat: { id: -100500, type: "group" } } }, "https://x")).toEqual([]);
    expect(botReplies(null, "https://x")).toEqual([]);
  });

  it("вебхук без секрета Telegram отклоняется, с секретом — отвечает", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    const calls = fakeTelegram();
    const update = JSON.stringify({ message: { text: "/start", chat: { id: 7, type: "private" } } });
    const denied = await webhookRoute(new Request("https://x/api/telegram", { method: "POST", body: update }));
    expect(denied.status).toBe(401);
    expect(calls).toEqual([]);
    const ok = await webhookRoute(
      new Request("https://x/api/telegram", {
        method: "POST",
        body: update,
        headers: { "x-telegram-bot-api-secret-token": webhookSecret(TOKEN) },
      }),
    );
    expect(ok.status).toBe(200);
    expect(calls).toEqual([expect.objectContaining({ method: "sendMessage" })]);
  });
});

describe("заказ из Telegram", () => {
  const order = (body: object) =>
    orderRoute(new Request("https://x/api/telegram/order", { method: "POST", body: JSON.stringify(body) }));

  it("без чата для заказов — 501, корзина откроет чат с менеджером как на сайте", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    const res = await order({ initData: fresh(), text: "Новый заказ!", storeId: "main" });
    expect(res.status).toBe(501);
  });

  it("отправляет заказ в рабочий чат и подтверждение покупателю", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_ORDERS_CHAT_ID = "-100777";
    const calls = fakeTelegram();
    // Подпись свежая относительно настоящего времени.
    const initData = signedInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
    const res = await order({ initData, text: "Новый заказ!\n1. Банан x2 <акция>", storeId: "main" });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.body.chat_id)).toEqual(["-100777", 42]);
    expect(String(calls[0].body.text)).toContain("&lt;акция&gt;"); // текст заказа экранирован для HTML
    expect(String(calls[0].body.text)).toContain("tg://user?id=42");
  });

  it("с поддельной подписью — 401, ничего не отправляется", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_ORDERS_CHAT_ID = "-100777";
    const calls = fakeTelegram();
    const res = await order({ initData: fresh().replace("ivan_buyer", "x"), text: "Новый заказ!", storeId: "main" });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("сообщение менеджеру с кнопкой «Написать покупателю», если есть @username", () => {
    const { toShop, toBuyer } = orderMessages({ text: "Новый заказ!", storeTitle: "Общий прайс", user, chatId: "-1" });
    expect(toShop).toMatchObject({ chat_id: "-1", parse_mode: "HTML" });
    expect(JSON.stringify(toShop)).toContain("https://t.me/ivan_buyer");
    expect(toBuyer.chat_id).toBe(42);
  });
});

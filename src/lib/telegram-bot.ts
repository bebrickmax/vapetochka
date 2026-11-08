import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { siteConfig } from "@/config/site";
import { storeInfos } from "@/config/stores";

/*
 * Telegram-бот «Vape Точка»: кнопка «Каталог» открывает сайт прямо в Telegram (Mini App),
 * а заказ из корзины бот может сразу отправить в рабочий чат.
 *
 * Настройка — TELEGRAM.md. Токен бота живёт только в переменной TELEGRAM_BOT_TOKEN на сервере.
 */

export const botToken = () => (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
/** Чат, куда бот присылает заказы (ID группы или менеджера; узнать — командой /id). */
export const ordersChatId = () => (process.env.TELEGRAM_ORDERS_CHAT_ID ?? "").trim();
export const isBotConfigured = () => /^\d+:[\w-]{20,}$/.test(botToken());

/** Секрет вебхука: Telegram присылает его в заголовке, чужие запросы отбрасываются. Выводится из токена. */
export function webhookSecret(token = botToken()): string {
  return createHash("sha256").update(`vapetochka-webhook:${token}`).digest("hex").slice(0, 48);
}

export async function callBot<T = unknown>(method: string, payload: object, token = botToken()): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  // В ошибке — только описание от Telegram, без адреса с токеном.
  if (!body?.ok) throw new Error(`Telegram ${method}: ${body?.description ?? res.status}`);
  return body.result as T;
}

// ─── Подпись данных Mini App ────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/**
 * Проверяет initData, которые Telegram передаёт открытому в нём сайту
 * (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Возвращает пользователя или null, если подпись не сошлась или данные старше maxAgeSeconds.
 */
export function verifyInitData(initData: string, token = botToken(), maxAgeSeconds = 24 * 3600, now = Date.now()): TelegramUser | null {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");
  if (hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSeconds) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "null") as TelegramUser | null;
    return user && typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

// ─── Ответы бота ────────────────────────────────────────────────────────────

/** Кнопки под сообщением: каталог каждой точки (открывается в Telegram) и чат с менеджером. */
export function catalogKeyboard(baseUrl: string) {
  return {
    inline_keyboard: [
      ...storeInfos.map((store) => [{ text: `🛍 ${store.title}`, web_app: { url: `${baseUrl}/${store.id}` } }]),
      [{ text: "💬 Написать менеджеру", url: `https://t.me/${siteConfig.telegramManager}` }],
    ],
  };
}

export const WELCOME =
  `Привет! Это ${siteConfig.displayName} 👋\n\n` +
  "Здесь актуальный каталог: жидкости, поды, одноразки и расходники с наличием и ценами.\n" +
  "Выберите точку — каталог откроется прямо в Telegram. Соберите корзину и нажмите «Отправить заказ».";

interface Update {
  message?: {
    text?: string;
    chat?: { id: number; type?: string; title?: string };
  };
}

/** Что ответить на сообщение. Пустой список — молчать (например, в группе на обычные сообщения). */
export function botReplies(update: unknown, baseUrl: string): object[] {
  const message = (update as Update | null)?.message;
  const chat = message?.chat;
  if (!chat || typeof chat.id !== "number") return [];
  const text = (message?.text ?? "").trim();
  const command = text.startsWith("/") ? text.split(/[\s@]/)[0].toLowerCase() : "";
  const isPrivate = chat.type === "private";

  if (command === "/id")
    return [
      {
        chat_id: chat.id,
        text:
          `ID этого чата: ${chat.id}\n\n` +
          "Чтобы заказы из каталога приходили сюда, впишите это число в Vercel в переменную TELEGRAM_ORDERS_CHAT_ID и сделайте Redeploy.",
      },
    ];
  if (!isPrivate) return []; // в группах бот только присылает заказы и отвечает на /id
  return [{ chat_id: chat.id, text: WELCOME, reply_markup: catalogKeyboard(baseUrl) }];
}

// ─── Заказ из корзины ───────────────────────────────────────────────────────

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const MAX_ORDER_LENGTH = 3500; // у Telegram предел — 4096 символов на сообщение

/** Сообщения о заказе: в рабочий чат и покупателю (подтверждение). */
export function orderMessages(order: { text: string; storeTitle: string; user: TelegramUser; chatId: string }) {
  const { user } = order;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Покупатель";
  // Ссылка на покупателя работает и без @username — по Telegram ID.
  const buyer = `<a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>${user.username ? ` (@${escapeHtml(user.username)})` : ""}`;
  const toShop = {
    chat_id: order.chatId,
    parse_mode: "HTML",
    text: `🛒 <b>Заказ из Telegram — ${escapeHtml(order.storeTitle)}</b>\nПокупатель: ${buyer}\n\n${escapeHtml(order.text)}`,
    ...(user.username && {
      reply_markup: { inline_keyboard: [[{ text: "Написать покупателю", url: `https://t.me/${user.username}` }]] },
    }),
  };
  const toBuyer = {
    chat_id: user.id,
    text: `✅ Заказ отправлен менеджеру — он напишет вам здесь, в Telegram.\n\n${order.text}`,
  };
  return { toShop, toBuyer };
}

// ─── Настройка бота ─────────────────────────────────────────────────────────

/**
 * Подключает бота к сайту: вебхук, кнопка «Каталог» слева от поля ввода, команды и описание.
 * Ничего не делает, если вебхук уже стоит на этот сайт. true — что-то настроили.
 */
export async function ensureBotSetup(baseUrl: string): Promise<boolean> {
  if (!isBotConfigured()) return false;
  const url = `${baseUrl}/api/telegram`;
  const info = await callBot<{ url?: string }>("getWebhookInfo", {});
  if (info.url === url) return false;
  await callBot("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message"], drop_pending_updates: true });
  await callBot("setChatMenuButton", { menu_button: { type: "web_app", text: "Каталог", web_app: { url: baseUrl } } });
  await callBot("setMyCommands", { commands: [{ command: "start", description: "Открыть каталог" }] });
  await callBot("setMyShortDescription", {
    short_description: `${siteConfig.displayName}: каталог с наличием и ценами, заказ в пару нажатий.`,
  });
  await callBot("setMyDescription", {
    description: `${siteConfig.displayName} — актуальный каталог жидкостей, подов, одноразок и расходников. Нажмите «Старт», выберите точку и соберите заказ.`,
  });
  return true;
}

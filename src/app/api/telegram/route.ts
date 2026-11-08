import { siteUrl } from "@/config/site";
import { botReplies, callBot, ensureBotSetup, isBotConfigured, webhookSecret } from "@/lib/telegram-bot";

/*
 * Вебхук Telegram-бота: сюда Telegram присылает сообщения боту.
 * GET ?secret=REVALIDATE_SECRET — подключить бота к сайту сразу, не дожидаясь автообновления.
 */

export async function POST(request: Request) {
  if (!isBotConfigured()) return new Response("Бот не настроен", { status: 404 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) return new Response("Нет доступа", { status: 401 });
  const update = await request.json().catch(() => null);
  for (const reply of botReplies(update, siteUrl))
    await callBot("sendMessage", reply).catch((error) => console.error("[telegram] Не удалось ответить:", error));
  // Telegram ждёт 200, иначе будет присылать то же сообщение снова.
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("x-revalidate-secret") ?? new URL(request.url).searchParams.get("secret");
  if (!secret || given !== secret) return Response.json({ ok: false, message: "Неверный или не настроенный секрет" }, { status: 401 });
  if (!isBotConfigured()) return Response.json({ ok: false, message: "Не задан TELEGRAM_BOT_TOKEN" }, { status: 404 });
  try {
    const changed = await ensureBotSetup(siteUrl);
    return Response.json({ ok: true, message: changed ? "Бот подключён к сайту" : "Бот уже подключён" });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "Ошибка Telegram" }, { status: 502 });
  }
}

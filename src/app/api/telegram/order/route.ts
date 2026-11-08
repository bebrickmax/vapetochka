import { getStore } from "@/config/stores";
import { callBot, isBotConfigured, MAX_ORDER_LENGTH, orderMessages, ordersChatId, verifyInitData } from "@/lib/telegram-bot";

/*
 * Заказ из корзины, открытой в Telegram: бот сразу присылает его в рабочий чат
 * (TELEGRAM_ORDERS_CHAT_ID), а покупателю — подтверждение.
 * Если чат для заказов не задан — 501, и корзина открывает чат с менеджером, как на сайте.
 */
export async function POST(request: Request) {
  const chatId = ordersChatId();
  if (!isBotConfigured() || !chatId) return Response.json({ ok: false, fallback: true }, { status: 501 });

  const body = (await request.json().catch(() => null)) as { initData?: unknown; text?: unknown; storeId?: unknown } | null;
  const user = verifyInitData(typeof body?.initData === "string" ? body.initData : "");
  if (!user) return Response.json({ ok: false, fallback: true, message: "Откройте каталог через бота заново" }, { status: 401 });
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_ORDER_LENGTH) return Response.json({ ok: false, fallback: true }, { status: 400 });
  const store = typeof body?.storeId === "string" ? getStore(body.storeId) : undefined;

  const { toShop, toBuyer } = orderMessages({ text, storeTitle: store?.title ?? "каталог", user, chatId });
  try {
    await callBot("sendMessage", toShop);
  } catch (error) {
    console.error("[telegram] Заказ не отправился в рабочий чат:", error);
    return Response.json({ ok: false, fallback: true }, { status: 502 });
  }
  // Подтверждение покупателю — не страшно, если не дошло (например, он не нажимал «Старт»).
  await callBot("sendMessage", toBuyer).catch((error) => console.error("[telegram] Подтверждение покупателю не дошло:", error));
  return Response.json({ ok: true });
}

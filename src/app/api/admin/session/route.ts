import {
  checkPassword,
  clearedSessionCookie,
  createSessionToken,
  isAdminConfigured,
  isAuthorized,
  sessionCookie,
} from "@/lib/admin/auth";
import { json } from "@/lib/admin/api";
import { isDbConfigured } from "@/lib/db/supabase";

/** Состояние входа и настроек — админка решает, что показать. */
export async function GET(request: Request) {
  return json({
    authorized: isAuthorized(request),
    adminConfigured: isAdminConfigured(),
    dbConfigured: isDbConfigured(),
  });
}

/** Вход по паролю. */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return json({ error: "Пароль админки не задан (ADMIN_PASSWORD)" }, 503);
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkPassword(password)) {
    // Небольшая пауза — подбирать пароль перебором неудобно.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return json({ error: "Неверный пароль" }, 401);
  }
  const response = json({ authorized: true });
  response.headers.append("Set-Cookie", sessionCookie(createSessionToken()));
  return response;
}

/** Выход. */
export async function DELETE() {
  const response = json({ authorized: false });
  response.headers.append("Set-Cookie", clearedSessionCookie());
  return response;
}

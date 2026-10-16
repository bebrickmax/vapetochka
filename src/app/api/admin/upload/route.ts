import { AdminError, adminRoute, json } from "@/lib/admin/api";
import { uploadPhoto } from "@/lib/db/supabase";

/** Vercel принимает не больше 4,5 МБ за запрос; админка уменьшает фото до отправки. */
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Загрузка фото в хранилище Supabase. Возвращает постоянную ссылку. */
export const POST = adminRoute(
  async (request) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AdminError("Выберите фото");
    const ext = TYPES[file.type];
    if (!ext) throw new AdminError("Подойдёт фото в формате JPG, PNG или WebP");
    if (file.size > MAX_BYTES) throw new AdminError("Фото больше 4 МБ — уменьшите его");
    const name = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    return json({ url: await uploadPhoto(name, await file.arrayBuffer(), file.type) }, 201);
  },
  { mutates: false },
);

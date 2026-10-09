import type { Category } from "@/lib/types";

interface CategoryMeta {
  id: string;
  title: string;
  icon: string;
}

/**
 * Красивые короткие названия и иконки для известных листов.
 * Ключ — название листа в нижнем регистре без лишних пробелов.
 * Новый лист, которого здесь нет, всё равно появится на сайте —
 * просто под своим названием и с иконкой по умолчанию.
 */
const KNOWN: Record<string, CategoryMeta> = {
  "жидкости ( salt)": { id: "liquids", title: "Жидкости", icon: "💧" },
  "жидкости (salt)": { id: "liquids", title: "Жидкости", icon: "💧" },
  жидкости: { id: "liquids", title: "Жидкости", icon: "💧" },
  "щелочь и 0": { id: "freebase", title: "Щелочь", icon: "🧪" },
  щелочь: { id: "freebase", title: "Щелочь", icon: "🧪" },
  одноразки: { id: "disposables", title: "Одноразки", icon: "⚡" },
  поды: { id: "pods", title: "Поды", icon: "📱" },
  расходники: { id: "consumables", title: "Расходники", icon: "🔩" },
  снюс: { id: "snus", title: "Снюс", icon: "🟢" },
  пластины: { id: "strips", title: "Пластины", icon: "🍬" },
  "койла, вата и др.": { id: "coils", title: "Койлы и вата", icon: "🌀" },
  "кальяный табак": { id: "hookah", title: "Кальян", icon: "💨" },
  "кальянный табак": { id: "hookah", title: "Кальян", icon: "💨" },
  напитки: { id: "drinks", title: "Напитки", icon: "🥤" },
  распродажа: { id: "sale", title: "Распродажа", icon: "🔥" },
};

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function normalizeSheetTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function slugify(text: string): string {
  const slug = normalizeSheetTitle(text)
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "category";
}

export function categoryFromSheet(sheetTitle: string): Category {
  const meta = KNOWN[normalizeSheetTitle(sheetTitle)];
  if (meta) return { ...meta, sheetTitle };
  const title = sheetTitle.trim().replace(/\s+/g, " ");
  return { id: slugify(title), title, icon: "🛍️", sheetTitle };
}

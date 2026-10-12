import { displayLine } from "@/lib/products";

/*
 * Бренды для фильтра внутри категории («Все · Tasty Lab · Duall · Hotspot…»).
 *
 * 1. Если в таблице над линейками стоит бренд — берём его.
 * 2. Иначе бренд — общее начало названий соседних линеек:
 *    «Drymost 5mg», «Drymost 75mg» → «Drymost»; «Elfbar 1500», «ELF BAR LUSH KING» → «Elfbar».
 * 3. Известные модели подсказывают производителя: «Xros 5» → Vaporesso.
 * 4. Если совпадений нет — название линейки без крепости и цифр.
 */

/** Модели, по которым однозначно понятен производитель. Ключ — первое слово в нижнем регистре. */
const MODEL_BRANDS: Record<string, string> = {
  xros: "Vaporesso",
  luxe: "Vaporesso",
  gtx: "Vaporesso",
  aegis: "GeekVape",
  sonder: "GeekVape",
  wenax: "GeekVape",
  pasito: "Smoant",
  charon: "Smoant",
  santi: "Smoant",
  knight: "Smoant",
  vmate: "Voopoo",
  argus: "Voopoo",
  drag: "Voopoo",
  vinci: "Voopoo",
  xlim: "OXVA",
  nexlim: "OXVA",
  feelin: "Brusko",
  minican: "Brusko",
  novo: "Smok",
  nord: "Smok",
  jellybox: "Rincoe",
  manto: "Rincoe",
};

/** Слова-типы товара, которые не являются брендом. */
const GENERIC_WORDS = new Set([
  "никотиновые",
  "никотиновый",
  "пластины",
  "пластинки",
  "паучи",
  "энергетик",
  "энергетики",
  "уголь",
  "жидкость",
  "жидкости",
  "табак",
  "снюс",
  "одноразка",
  "одноразки",
  "с",
  "капсулой",
]);

/** Бренды из таблицы, которые на деле не бренд: «Liquid» над Pixel. */
const GENERIC_BRAND_RE = /^(?:liquid|e-?liquid|жидкост\S*)$/i;

const CONNECTORS = new Set(["and", "x", "х", "&", "и", "×"]);

const keyOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** «DUALL» → «Duall», «HQD» остаётся «HQD»: капслок длинных слов смягчаем. */
export function prettyBrand(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length >= 5 && word === word.toUpperCase() && /\p{Lu}/u.test(word)
        ? word[0] + word.slice(1).toLowerCase()
        : word,
    )
    .join(" ");
}

/** Слова названия без крепости, объёмов, количества затяжек и слов-типов. */
export function nameWords(line: string, strength?: string): string[] {
  return displayLine(line, strength)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:mg|мг|ml|мл|g|г|%|k|к)?(?![\p{L}])/giu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w && !GENERIC_WORDS.has(w.toLowerCase()));
}

interface FamilyInput {
  line: string;
  strength?: string;
  brand?: string;
}

/** Начало названия, которое считается брендом: «Drymost», а «Рик и Морти» — со связкой. */
function headWords(words: string[]): string[] {
  return words.length > 2 && CONNECTORS.has(words[1].toLowerCase()) ? words.slice(0, 3) : words.slice(0, 1);
}

/** Бренд-«чипс» для каждой линейки одной категории (в том же порядке). */
export function assignFamilies(groups: readonly FamilyInput[]): string[] {
  const words = groups.map((g) => nameWords(g.line, g.strength));
  const heads = words.map(headWords);
  const headKeys = heads.map((h) => keyOf(h.join("")));

  // «ELF BAR LUSH KING» и «Elfbar 1500» — один бренд: склеиваем два первых слова, если такое начало уже есть.
  // «PODONKI x MAD» рядом с «Podonki Critical» — тоже Podonki: связка не мешает общему бренду.
  const keys = words.map((w, i) => {
    const joined = w.length > 1 ? keyOf(w[0] + w[1]) : "";
    if (joined && joined !== headKeys[i] && headKeys.includes(joined)) return joined;
    const first = w[0] ? keyOf(w[0]) : "";
    if (heads[i].length > 1 && headKeys.some((k, j) => j !== i && k === first)) return first;
    return headKeys[i];
  });
  const counts = new Map<string, number>();
  keys.forEach((k) => k && counts.set(k, (counts.get(k) ?? 0) + 1));

  // Как писать бренд: первое написание, но без сплошного капслока, если есть вариант лучше.
  const spelling = new Map<string, string>();
  const isCaps = (s: string) => s === s.toUpperCase();
  words.forEach((w, i) => {
    const key = keys[i];
    if (!key) return;
    const candidate =
      key === headKeys[i] ? heads[i].join(" ") : key === keyOf(w[0]) ? w[0] : `${w[0]}${w[1] ?? ""}`;
    const current = spelling.get(key);
    if (!current || (isCaps(current) && !isCaps(candidate))) spelling.set(key, candidate);
  });

  const explicitByKey = new Map<string, string>();
  for (const g of groups) {
    if (g.brand && !GENERIC_BRAND_RE.test(g.brand.trim())) explicitByKey.set(keyOf(g.brand), prettyBrand(g.brand));
  }

  return groups.map((group, i) => {
    if (group.brand && !GENERIC_BRAND_RE.test(group.brand.trim())) return prettyBrand(group.brand);

    const w = words[i];
    if (w.length === 0) return prettyBrand(group.line);
    const key = keys[i];

    const known = MODEL_BRANDS[key];
    if (known) return known;
    if (explicitByKey.has(key)) return explicitByKey.get(key)!;
    if ((counts.get(key) ?? 0) >= 2) return prettyBrand(spelling.get(key)!);

    // Одиночная линейка: может, в названии есть бренд соседей («Яблочки Faff» → Faff).
    for (const word of w.slice(1)) {
      const k = keyOf(word);
      if ((counts.get(k) ?? 0) >= 2) return prettyBrand(spelling.get(k) ?? word);
      if (explicitByKey.has(k)) return explicitByKey.get(k)!;
      if (MODEL_BRANDS[k]) return MODEL_BRANDS[k];
    }

    // Иначе — короткое название: одно-два слова («Rick and Morty» — три, со связкой).
    const take = heads[i].length === 3 ? 3 : Math.min(2, w.length);
    return prettyBrand(w.slice(0, take).join(" "));
  });
}

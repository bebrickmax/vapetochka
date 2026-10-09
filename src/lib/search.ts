import type { Category, Product } from "@/lib/types";

/*
 * «Умный» поиск без сторонних библиотек:
 *  - регистр, ё/е, эмодзи и пунктуация не важны;
 *  - "20 mg", "20мг", "20mg" — одно и то же;
 *  - понимает текст, набранный не в той раскладке ("ылфдф" → "skala");
 *  - понимает транслит ("скала" → "skala", "элфбар" → "elfbar");
 *  - знает частые синонимы (лёд ↔ ice, кислый ↔ sour, мята ↔ mint…).
 * Все слова запроса должны найтись в карточке (в любом порядке).
 */

const RU = "йцукенгшщзхъфывапролджэячсмитьбю";
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const RU_TO_EN_LAYOUT = new Map([...RU].map((ch, i) => [ch, EN[i]]));
const EN_TO_RU_LAYOUT = new Map([...EN].map((ch, i) => [ch, RU[i]]));

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const SYNONYMS: string[][] = [
  ["лед", "ice", "холод", "freez", "cool", "заморозк", "замерз"],
  ["кисл", "sour", "acid"],
  ["мят", "mint", "ментол", "menthol"],
  ["арбуз", "watermelon"],
  ["клубник", "strawberr", "землян"],
  ["малин", "raspberr"],
  ["черник", "blueberr", "голубик"],
  ["виноград", "grape"],
  ["яблок", "apple"],
  ["манго", "mango"],
  ["персик", "peach"],
  ["вишн", "cherry"],
  ["банан", "banana"],
  ["ананас", "pineapple"],
  ["лимон", "lemon"],
  ["лимонад", "lemonade"],
  ["кола", "cola"],
  ["энергетик", "energy"],
  ["жвачк", "bubble", "gum", "баблгам"],
  ["табак", "tobacco"],
  ["дын", "melon"],
  ["киви", "kiwi"],
  ["чай", "tea"],
  ["испарител", "coil", "койл"],
  ["картридж", "cartridge", "pod"],
];

const normalizeBase = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\p{Extended_Pictographic}‍️]/gu, " ")
    .replace(/(\d)[.,](\d)/g, "$1.$2")
    .replace(/[^\p{L}\p{N}.%;'[\],]+/gu, " ");

/** Нормализация текста карточки (без символов раскладки). */
export function normalize(text: string): string {
  return normalizeBase(text)
    .replace(/[;'[\],]/g, " ")
    .replace(/(\d)\s*(?:мг|mg)/g, "$1mg")
    .replace(/(\d)\s+%/g, "$1%")
    .replace(/\s+/g, " ")
    .trim();
}

const swap = (token: string, map: Map<string, string>) => [...token].map((ch) => map.get(ch) ?? ch).join("");
const translit = (token: string) => [...token].map((ch) => TRANSLIT[ch] ?? ch).join("");

function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  // Короткие токены не конвертируем — иначе «ф» из «a» находит всё подряд.
  if (token.length >= 3 && /[а-я]/.test(token)) {
    variants.add(translit(token));
    variants.add(swap(token, RU_TO_EN_LAYOUT));
  }
  if (token.length >= 3 && /[a-z;'[\],.]/.test(token)) variants.add(swap(token, EN_TO_RU_LAYOUT));
  for (const v of [...variants]) {
    for (const group of SYNONYMS) {
      if (group.some((word) => v.startsWith(word) || (v.length >= 3 && word.startsWith(v)))) {
        group.forEach((word) => variants.add(word));
      }
    }
  }
  return [...variants].map(normalize).filter((v) => v.length > 0);
}

export interface SearchQuery {
  tokens: string[][];
}

/** Разбирает строку поиска один раз — дальше её можно проверять на тысячах карточек. */
export function parseQuery(query: string): SearchQuery {
  const raw = normalizeBase(query)
    .replace(/(\d)\s*(?:мг|mg)/g, "$1mg")
    .split(/\s+/)
    .filter(Boolean);
  return { tokens: raw.map(tokenVariants).filter((variants) => variants.length > 0) };
}

export function buildHaystack(product: Product, category?: Category): string {
  return normalize(
    [
      product.brand,
      product.line,
      product.name,
      product.description,
      product.variant,
      product.strength,
      product.note,
      category?.title,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function matches(haystack: string, query: SearchQuery): boolean {
  return query.tokens.every((variants) => variants.some((v) => haystack.includes(v)));
}

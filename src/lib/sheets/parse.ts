import type { ProductGroup, ProductItem, StockStatus } from "@/lib/types";

/*
 * Парсер листа прайса. Лист устроен блоками:
 *
 *   Tasty Lab                         ← бренд (необязательно), после него пустая строка
 *                                     ← пустая строка
 *   Рик и Морти 50mg                  ← название линейки
 *   Цена за пару                      ← пояснение (необязательно), сразу под названием
 *   15 BYN                            ← цена (может стоять в одной строке с первым товаром)
 *          | Ананас - Описание | ✅    ← товары: колонка A пустая, B — название, далее отметка
 *          | GTX | 0.6 Ом | ✅         ← доп. колонка = вариант (сопротивление и т.п.)
 *          |     | 0.8 Ом | ❌         ← пустое название = то же, что строкой выше
 */

const PRICE_RE = /^(\d+(?:[.,]\d+)?)\s*(?:byn|бун|руб\.?|р\.?)$/i;
const IN_STOCK_RE = /[✅✔☑]/u;
const OUT_OF_STOCK_RE = /[❌✖❎⛔🚫]/u;
const IN_STOCK_WORDS = new Set(["да", "есть", "в наличии"]);
const OUT_OF_STOCK_WORDS = new Set(["нет", "нет в наличии", "ожидается"]);
const PLACEHOLDER_RE = /^[-—–.]+$/;
const DESCRIPTION_SPLIT_RE = /\s+[-—–]\s*|\s*[—–]\s+/;
const LEADING_EMOJI_RE =
  /^(?:[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}‍️⃣]|\s)+/u;
const STRENGTH_MG_RE = /(\d+(?:[.,]\d+)?)\s*(?:mg|мг)(?![a-zа-я])/i;
const STRENGTH_PCT_RE = /(\d+(?:[.,]\d+)?)\s*%/;

/** Строки-объявления, которые не являются товарами. */
const NOTICE_RE = /внимание|для заказа|@\w{3,}|t\.me\//i;
const NOTICE_MAX_LENGTH = 140;

export function parsePrice(cell: string): number | null {
  const match = cell.trim().match(PRICE_RE);
  return match ? Number(match[1].replace(",", ".")) : null;
}

export function parseStatus(cell: string): StockStatus | null {
  const value = cell.trim().toLowerCase();
  if (!value) return null;
  if (IN_STOCK_RE.test(value)) return "in";
  if (OUT_OF_STOCK_RE.test(value)) return "out";
  if (IN_STOCK_WORDS.has(value)) return "in";
  if (OUT_OF_STOCK_WORDS.has(value)) return "out";
  return null;
}

export function parseStrength(text: string): string | undefined {
  const mg = text.match(STRENGTH_MG_RE);
  if (mg) return `${mg[1].replace(",", ".")} мг`;
  const pct = text.match(STRENGTH_PCT_RE);
  if (pct) return `${pct[1].replace(",", ".")}%`;
  return undefined;
}

/** "🍍❄️Ананас - Сочный" → { emoji: "🍍❄️", name: "Ананас", description: "Сочный" } */
export function splitItemName(raw: string): Pick<ProductItem, "name" | "emoji" | "description"> {
  let text = raw.replace(/\s+/g, " ").trim();
  const emojiMatch = text.match(LEADING_EMOJI_RE);
  const emoji = emojiMatch ? emojiMatch[0].replace(/\s/g, "") : "";
  if (emojiMatch) text = text.slice(emojiMatch[0].length).trim();

  const split = text.match(DESCRIPTION_SPLIT_RE);
  let name = text;
  let description = "";
  if (split && split.index !== undefined && split.index > 0) {
    name = text.slice(0, split.index).trim();
    description = text.slice(split.index + split[0].length).trim();
  }
  return {
    name: name || text,
    ...(emoji && { emoji }),
    ...(description && { description }),
  };
}

const clean = (cell: unknown) =>
  typeof cell === "string" ? cell.replace(/\s+/g, " ").trim() : cell == null ? "" : String(cell).trim();

const isNotice = (text: string) => NOTICE_RE.test(text) || text.length > NOTICE_MAX_LENGTH;

type RowKind = "start" | "blank" | "header" | "note" | "price" | "item";

export function parseSheet(rows: unknown[][], categoryId: string): ProductGroup[] {
  const groups: ProductGroup[] = [];

  let lastKind: RowKind = "start";
  let pendingHeaders: string[] = [];
  let pendingNote: string | undefined;
  let brand: string | undefined;
  let group: ProductGroup | null = null;
  let price: number | null = null;
  let oldPrice: number | undefined;
  let prevRowHadPrice = false;
  let itemsSincePrice: ProductItem[] = [];
  let lastItemName: string | undefined;

  const openGroup = () => {
    if (pendingHeaders.length === 0 && group) return group;
    let line = "";
    if (pendingHeaders.length > 0) {
      line = pendingHeaders[pendingHeaders.length - 1];
      if (pendingHeaders.length > 1) brand = pendingHeaders.slice(0, -1).join(" · ");
    }
    group = {
      categoryId,
      line,
      ...(brand && { brand }),
      ...(parseStrength(line) && { strength: parseStrength(line) }),
      ...(pendingNote && { note: pendingNote }),
      items: [],
    };
    groups.push(group);
    pendingHeaders = [];
    pendingNote = undefined;
    price = null;
    oldPrice = undefined;
    itemsSincePrice = [];
    lastItemName = undefined;
    return group;
  };

  const applyPrice = (value: number) => {
    openGroup();
    // Две цены подряд (обычно на листе «Распродажа»): первая — старая, вторая — новая.
    if (prevRowHadPrice && price !== null && value < price) {
      oldPrice = price;
      price = value;
      for (const item of itemsSincePrice) {
        item.price = value;
        item.oldPrice = oldPrice;
      }
      return;
    }
    price = value;
    oldPrice = undefined;
    itemsSincePrice = [];
  };

  const addItem = (cells: string[]) => {
    const target = openGroup();

    let statusIndex = -1;
    let status: StockStatus = "unknown";
    for (let i = cells.length - 1; i >= 0; i--) {
      const parsed = parseStatus(cells[i]);
      if (parsed) {
        statusIndex = i;
        status = parsed;
        break;
      }
    }

    const textCells = cells.filter((_, i) => i !== statusIndex);
    const first = textCells[0] ?? "";
    const extra = textCells.slice(1).filter((c) => c && !PLACEHOLDER_RE.test(c));

    let rawName = first;
    if (!rawName) {
      if (lastItemName) rawName = lastItemName;
      else rawName = extra.shift() ?? "";
    }
    if (!rawName) return;
    lastItemName = rawName;

    const variant = extra.join(" · ");
    const item: ProductItem = {
      ...splitItemName(rawName),
      ...(variant && { variant }),
      price,
      ...(oldPrice !== undefined && { oldPrice }),
      status,
    };
    target.items.push(item);
    itemsSincePrice.push(item);
  };

  for (const rawRow of rows) {
    const cells = (rawRow ?? []).map(clean);
    while (cells.length && !cells[cells.length - 1]) cells.pop();

    if (cells.length === 0) {
      lastKind = "blank";
      prevRowHadPrice = false;
      continue;
    }

    const [first, ...rest] = cells;
    const hasItem = rest.some(Boolean);
    const rowPrice = parsePrice(first);

    if (hasItem) {
      if (rowPrice !== null) applyPrice(rowPrice);
      addItem(rest);
      prevRowHadPrice = rowPrice !== null;
      lastKind = "item";
      continue;
    }

    if (rowPrice !== null) {
      applyPrice(rowPrice);
      prevRowHadPrice = true;
      lastKind = "price";
      continue;
    }
    prevRowHadPrice = false;

    // Объявления и одиночные ✅/❌ в колонке A пропускаем, не меняя контекст.
    if (isNotice(first) || parseStatus(first)) continue;

    if (lastKind === "header" && pendingHeaders.length > 0) {
      // Текст сразу под заголовком без пустой строки — это пояснение к линейке.
      pendingNote = pendingNote ? `${pendingNote} ${first}` : first;
      lastKind = "note";
      continue;
    }

    if (pendingHeaders.length > 0 && (lastKind === "blank" || lastKind === "note")) {
      // Бренд → пустая строка → линейка.
      pendingHeaders.push(first);
    } else {
      pendingHeaders = [first];
      pendingNote = undefined;
    }
    lastKind = "header";
  }

  return groups.filter((g) => g.items.length > 0);
}

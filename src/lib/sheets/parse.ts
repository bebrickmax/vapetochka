import type { ProductGroup, ProductItem, StockStatus } from "@/lib/types";

/** Позиция до присвоения id — его выставляет сборка каталога. */
export type ParsedGroup = Omit<ProductGroup, "id">;

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
 *
 *   Картриджи                         ← подраздел (известное слово над брендами)
 *
 * Фото (картинка в ячейке колонки A) относится к позиции в своей строке,
 * а первое фото линейки становится её обложкой.
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

/** Заголовки-подразделы листа: стоят над брендами, а не над товарами. */
const SECTION_RE = /^(?:картридж|испарител)/i;

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

export function parseSheet(
  rows: unknown[][],
  categoryId: string,
  images: Record<number, string> = {},
): ParsedGroup[] {
  const groups: ParsedGroup[] = [];

  let lastKind: RowKind = "start";
  let pendingHeaders: string[] = [];
  let pendingNote: string | undefined;
  let brand: string | undefined;
  let section: string | undefined;
  let group: ParsedGroup | null = null;
  let price: number | null = null;
  let oldPrice: number | undefined;
  let prevRowHadPrice = false;
  let itemsSincePrice: ProductItem[] = [];
  let lastItemName: string | undefined;
  let lastItemImage: string | undefined;
  /** Фото со строки заголовка/цены — достанется линейке. */
  let pendingImage: string | undefined;

  const openGroup = () => {
    if (pendingHeaders.length === 0 && group) return group;
    let line = "";
    if (pendingHeaders.length > 0) {
      line = pendingHeaders[pendingHeaders.length - 1];
      if (pendingHeaders.length > 1) {
        const above = pendingHeaders.slice(0, -1);
        const sectionTitle = above.find((h) => SECTION_RE.test(h));
        const brands = above.filter((h) => !SECTION_RE.test(h));
        if (sectionTitle) {
          section = sectionTitle;
          brand = undefined;
        }
        if (brands.length) brand = brands.join(" · ");
      }
    }
    group = {
      categoryId,
      line,
      ...(brand && { brand }),
      ...(section && { section }),
      ...(parseStrength(line) && { strength: parseStrength(line) }),
      ...(pendingNote && { note: pendingNote }),
      ...(pendingImage && { image: pendingImage }),
      items: [],
    };
    groups.push(group);
    pendingHeaders = [];
    pendingNote = undefined;
    pendingImage = undefined;
    price = null;
    oldPrice = undefined;
    itemsSincePrice = [];
    lastItemName = undefined;
    lastItemImage = undefined;
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

  const addItem = (cells: string[], image: string | undefined) => {
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
    let continuation = false;
    if (!rawName) {
      if (lastItemName) {
        rawName = lastItemName;
        continuation = true;
      } else rawName = extra.shift() ?? "";
    }
    if (!rawName) return;
    lastItemName = rawName;

    // Строка-продолжение (то же название, другой вариант) берёт фото предыдущей.
    const itemImage = image ?? (continuation ? lastItemImage : undefined);
    lastItemImage = itemImage;
    if (itemImage && !target.image) target.image = itemImage;

    const variant = extra.join(" · ");
    const item: ProductItem = {
      ...splitItemName(rawName),
      ...(variant && { variant }),
      price,
      ...(oldPrice !== undefined && { oldPrice }),
      status,
      ...(itemImage && { image: itemImage }),
    };
    target.items.push(item);
    itemsSincePrice.push(item);
  };

  rows.forEach((rawRow, rowIndex) => {
    const image = images[rowIndex];
    const cells = (rawRow ?? []).map(clean);
    while (cells.length && !cells[cells.length - 1]) cells.pop();

    if (cells.length === 0) {
      lastKind = "blank";
      prevRowHadPrice = false;
      if (image) pendingImage ??= image;
      return;
    }

    const [first, ...rest] = cells;
    const hasItem = rest.some(Boolean);
    const rowPrice = parsePrice(first);

    if (hasItem) {
      if (rowPrice !== null) applyPrice(rowPrice);
      addItem(rest, image);
      prevRowHadPrice = rowPrice !== null;
      lastKind = "item";
      return;
    }

    if (rowPrice !== null) {
      applyPrice(rowPrice);
      if (image && group && !group.image) group.image = image;
      prevRowHadPrice = true;
      lastKind = "price";
      return;
    }
    prevRowHadPrice = false;

    // Объявления и одиночные ✅/❌ в колонке A пропускаем, не меняя контекст.
    if (isNotice(first) || parseStatus(first)) return;

    if (image) pendingImage ??= image;

    if (lastKind === "header" && pendingHeaders.length > 0) {
      // Текст сразу под заголовком без пустой строки — это пояснение к линейке.
      pendingNote = pendingNote ? `${pendingNote} ${first}` : first;
      lastKind = "note";
      return;
    }

    if (pendingHeaders.length > 0 && (lastKind === "blank" || lastKind === "note")) {
      // Бренд → пустая строка → линейка.
      pendingHeaders.push(first);
    } else {
      pendingHeaders = [first];
      pendingNote = undefined;
    }
    lastKind = "header";
  });

  return groups.filter((g) => g.items.length > 0);
}

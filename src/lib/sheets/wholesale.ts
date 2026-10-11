import { sheetsConfig } from "@/config/site";
import type { Wholesale, WholesaleBrand, WholesaleItem, WholesaleSection } from "@/lib/types";

/*
 * Лист «ОПТ» устроен так:
 *
 *            |                | 10 шт | 30 шт | 50 шт | 100 шт   ← ступени цены
 *   Жидкости                                                    ← раздел (после него пустая строка)
 *
 *   Duall                                                       ← бренд (сразу за ним — позиции)
 *   [фото]   | Duall 20mg     | 11    | 10,5  | 10    | 9,5
 */

const TIER_RE = /^(?:от\s*)?(\d+)\s*(?:шт|штук|pcs)\.?$/i;
const NUMBER_RE = /^\d+(?:[.,]\d+)?(?:\s*(?:byn|бун|р\.?|руб\.?))?$/i;

const clean = (cell: unknown) => (cell == null ? "" : String(cell).replace(/\s+/g, " ").trim());

function toPrice(cell: string): number | null {
  if (!NUMBER_RE.test(cell)) return null;
  return Number(cell.replace(/[^\d.,]/g, "").replace(",", "."));
}

export function parseWholesaleSheet(rows: unknown[][], images: Record<number, string> = {}): Wholesale | undefined {
  const tiers: string[] = [];
  const sections: WholesaleSection[] = [];
  let section: WholesaleSection | null = null;
  let brand: WholesaleBrand | null = null;
  let pendingTitle: string | null = null;

  const ensureSection = (title = "") => {
    if (!section) {
      section = { title, brands: [] };
      sections.push(section);
    }
    return section;
  };

  const lines = rows.map((row) => (row ?? []).map(clean));

  lines.forEach((cells, rowIndex) => {
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    if (cells.length === 0) {
      // Заголовок, после которого пустая строка, — это раздел.
      if (pendingTitle !== null) {
        section = { title: pendingTitle, brands: [] };
        sections.push(section);
        brand = null;
        pendingTitle = null;
      }
      return;
    }

    // Строка со ступенями: «10 шт | 30 шт | 50 шт | 100 шт».
    const tierCells = cells.filter((c) => TIER_RE.test(c));
    if (tierCells.length >= 2 && tiers.length === 0) {
      for (const cell of tierCells) tiers.push(`от ${cell.match(TIER_RE)![1]} шт`);
      return;
    }

    const filled = cells.map((c, i) => ({ c, i })).filter(({ c }) => c);
    const priceCells = filled.filter(({ c }) => toPrice(c) !== null);
    const textCells = filled.filter(({ c }) => toPrice(c) === null);

    // Позиция: колонка A пустая (или в ней только фото) — название и цены правее.
    // Цен может ещё не быть — тогда «цена по запросу».
    const isItem = textCells.length > 0 && (priceCells.length > 0 || (!cells[0] && textCells[0].i > 0));
    if (isItem) {
      if (pendingTitle !== null) {
        brand = { title: pendingTitle, items: [] };
        ensureSection().brands.push(brand);
        pendingTitle = null;
      }
      if (!brand) {
        brand = { title: "", items: [] };
        ensureSection().brands.push(brand);
      }
      const nameIndex = textCells[0].i;
      const prices = cells.slice(nameIndex + 1).filter(Boolean).map(toPrice);
      const item: WholesaleItem = {
        name: textCells.map(({ c }) => c).join(" "),
        prices,
        ...(images[rowIndex] && { image: images[rowIndex] }),
      };
      brand.items.push(item);
      return;
    }

    if (textCells.length > 0 && priceCells.length === 0) {
      // Заголовок: раздел (после него пустая строка) или бренд (после него позиции).
      // Два заголовка подряд — у первого бренда позиций пока нет, пропускаем его.
      pendingTitle = textCells.map(({ c }) => c).join(" ");
    }
  });

  const nonEmpty = sections
    .map((s) => ({ ...s, brands: s.brands.filter((b) => b.items.length > 0) }))
    .filter((s) => s.brands.length > 0);

  if (nonEmpty.length === 0) {
    const text = lines.map((cells) => cells.filter(Boolean).join(" · ")).filter(Boolean);
    return text.length ? { tiers: [], sections: [], lines: text } : undefined;
  }

  const width = Math.max(...nonEmpty.flatMap((s) => s.brands.flatMap((b) => b.items.map((i) => i.prices.length))));
  const labels = Array.from(
    { length: width },
    (_, i) => tiers[i] ?? sheetsConfig.wholesaleTiers[i] ?? `цена ${i + 1}`,
  );
  return { tiers: labels, sections: nonEmpty, lines: [] };
}

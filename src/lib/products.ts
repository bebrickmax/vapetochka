import type { Product, ProductGroup } from "@/lib/types";

/** Разворачивает группы в плоский список карточек. */
export function flattenGroups(groups: ProductGroup[]): Product[] {
  const products: Product[] = [];
  groups.forEach((group, groupIndex) => {
    const { items, ...groupFields } = group;
    items.forEach((item, itemIndex) => {
      products.push({
        ...groupFields,
        ...item,
        strength: group.strength,
        id: `${group.categoryId}-${groupIndex}-${itemIndex}`,
      });
    });
  });
  return products;
}

/** Человекочитаемое название позиции для заказа: "Skala 20mg — Банан со льдом (0.6 Ом)". */
export function productTitle(product: Pick<Product, "line" | "name" | "variant">): string {
  const base = product.line ? `${product.line} — ${product.name}` : product.name;
  return product.variant ? `${base} (${product.variant})` : base;
}

/**
 * Название линейки для карточки без крепости — она показана отдельным значком:
 * "Skala 20mg" → "Skala". Если после удаления ничего не осталось — исходное название.
 */
export function displayLine(line: string, strength?: string): string {
  if (!strength) return line;
  const stripped = line
    .replace(/\s*\d+(?:[.,]\d+)?\s*(?:mg|мг)(?![a-zа-я])/i, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*%/, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || line;
}

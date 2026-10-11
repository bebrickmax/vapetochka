import type { Product, ProductGroup } from "@/lib/types";

/** Позиция линейки как отдельный товар (для корзины и поиска). */
export function toProduct(group: ProductGroup, itemIndex: number): Product {
  const item = group.items[itemIndex];
  return {
    ...item,
    id: `${group.id}-${itemIndex}`,
    groupId: group.id,
    categoryId: group.categoryId,
    line: group.line,
    ...(group.brand && { brand: group.brand }),
    ...(group.family && { family: group.family }),
    ...(group.strength && { strength: group.strength }),
    ...(group.note && { note: group.note }),
  };
}

/** Разворачивает группы в плоский список позиций. */
export function flattenGroups(groups: ProductGroup[]): Product[] {
  return groups.flatMap((group) => group.items.map((_, itemIndex) => toProduct(group, itemIndex)));
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

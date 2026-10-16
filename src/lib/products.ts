import type { Product, ProductGroup, ProductItem } from "@/lib/types";

/**
 * Короткий стабильный ключ из текста (FNV-1a → base36). Нужен, чтобы id товара
 * не зависел от номера строки: вставили вкус выше — корзина не «съезжает».
 */
export function stableKey(text: string): string {
  const normalized = text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Уникальные ключи для списка: при повторе добавляется «-2», «-3»… */
export function uniqueKeys(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const key = stableKey(text);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}-${n}`;
  });
}

const itemText = (item: ProductItem) => `${item.name}|${item.variant ?? ""}`;

const itemKeysCache = new WeakMap<ProductGroup, string[]>();
function itemKeys(group: ProductGroup): string[] {
  let keys = itemKeysCache.get(group);
  if (!keys) {
    keys = uniqueKeys(group.items.map(itemText));
    itemKeysCache.set(group, keys);
  }
  return keys;
}

/** Позиция линейки как отдельный товар (для корзины и поиска). */
export function toProduct(group: ProductGroup, itemIndex: number): Product {
  const item = group.items[itemIndex];
  return {
    ...item,
    id: `${group.id}-${itemKeys(group)[itemIndex]}`,
    groupId: group.id,
    categoryId: group.categoryId,
    line: group.line,
    ...(group.brand && { brand: group.brand }),
    ...(group.family && { family: group.family }),
    ...(group.strength && { strength: group.strength }),
    ...(group.note && { note: group.note }),
    ...(group.isNew && { isNew: true }), // новая линейка — новинка каждый её вкус
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

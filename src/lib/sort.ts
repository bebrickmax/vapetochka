/*
 * Алфавитный порядок вкусов. Общий для сервера и админки — чтобы экран сразу
 * показывал тот же порядок, что сохранится в базе.
 */

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/** Ключ сортировки: без эмодзи и значков в начале («🍍❄️Ананас со льдом» → «Ананас со льдом»). */
export function sortKey(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

interface Sortable {
  id: string;
  title: string;
  variant?: string | null;
  sort: number;
}

export function compareTitles(a: Pick<Sortable, "title" | "variant">, b: Pick<Sortable, "title" | "variant">): number {
  return collator.compare(sortKey(a.title), sortKey(b.title)) || collator.compare(a.variant ?? "", b.variant ?? "");
}

/**
 * Новые значения `sort` для позиций ОДНОЙ линейки по алфавиту.
 * Возвращает только те, что изменились.
 */
export function alphabeticalOrder<T extends Sortable>(items: readonly T[]): Map<string, number> {
  const changed = new Map<string, number>();
  [...items].sort(compareTitles).forEach((item, index) => {
    const sort = (index + 1) * 10;
    if (item.sort !== sort) changed.set(item.id, sort);
  });
  return changed;
}

/** То же для многих линеек сразу: позиции группируются по `line_id`. */
export function alphabeticalOrderByLine<T extends Sortable & { line_id: string }>(
  items: readonly T[],
  lineIds?: ReadonlySet<string>,
): Map<string, number> {
  const byLine = new Map<string, T[]>();
  for (const item of items) {
    if (lineIds && !lineIds.has(item.line_id)) continue;
    const list = byLine.get(item.line_id) ?? [];
    list.push(item);
    byLine.set(item.line_id, list);
  }
  const changed = new Map<string, number>();
  for (const list of byLine.values()) for (const [id, sort] of alphabeticalOrder(list)) changed.set(id, sort);
  return changed;
}

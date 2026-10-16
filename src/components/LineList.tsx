"use client";

import { useEffect, useRef, useState } from "react";
import { pluralize } from "@/lib/format";
import type { Category, ProductGroup } from "@/lib/types";
import { CategoryIcon } from "./icons";
import { displayLine } from "@/lib/products";
import { LineCard, startsWithFamily } from "./LineCard";

/** Сколько линеек дорисовывается за раз. */
const PAGE_SIZE = 12;

export interface LineEntry {
  group: ProductGroup;
  visible: number[];
}

export interface LineSection {
  key: string;
  title?: string;
  /** Иконка категории у заголовка (вкладка «Все», поиск). */
  categoryId?: string;
  entries: LineEntry[];
}

interface LineListProps {
  sections: LineSection[];
  /** Показывать категорию на карточках. */
  categories?: Map<string, Category>;
  /** Все позиции развёрнуты (при поиске). */
  expanded?: boolean;
}

/**
 * Линейки по разделам (бренд или категория) с постепенной подгрузкой:
 * в DOM попадает только то, до чего покупатель долистал.
 * Сбрасывается через `key` при смене фильтров.
 */
export function LineList({ sections, categories, expanded }: LineListProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const total = sections.reduce((sum, s) => sum + s.entries.length, 0);
  const hasMore = limit < total;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE_SIZE);
      },
      { rootMargin: "1600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, limit]);

  // Сколько линеек каждого раздела уже показать: разделы по порядку, всего не больше limit.
  const shownCounts = sections.reduce<number[]>((counts, section) => {
    const used = counts.reduce((sum, n) => sum + n, 0);
    return [...counts, Math.max(0, Math.min(section.entries.length, limit - used))];
  }, []);

  return (
    <div className="space-y-8">
      {sections.map((section, sectionIndex) => {
        if (shownCounts[sectionIndex] === 0) return null;
        const entries = section.entries.slice(0, shownCounts[sectionIndex]);
        const lines = section.entries.length;
        // «Skala» над единственной карточкой «Skala» — лишний повтор: заголовок раздела прячем.
        const showTitle =
          !!section.title &&
          (!!section.categoryId ||
            section.entries.some(
              ({ group }) => !startsWithFamily(displayLine(group.line, group.strength), section.title!),
            ));
        return (
          <section key={section.key} aria-label={section.title}>
            {showTitle && (
              <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                <h2 className="font-wide flex min-w-0 items-center gap-2 text-[19px] font-semibold leading-tight">
                  {section.categoryId && (
                    <CategoryIcon id={section.categoryId} width={20} height={20} className="shrink-0 text-muted" />
                  )}
                  <span className="truncate">{section.title}</span>
                </h2>
                <span className="shrink-0 text-[13px] text-muted">
                  {lines} {pluralize(lines, ["линейка", "линейки", "линеек"])}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {entries.map(({ group, visible }) => (
                <LineCard
                  key={group.id}
                  group={group}
                  visible={visible}
                  category={categories?.get(group.categoryId)}
                  expanded={expanded}
                  hideFamily={showTitle && !section.categoryId}
                />
              ))}
            </div>
          </section>
        );
      })}
      {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden />}
    </div>
  );
}

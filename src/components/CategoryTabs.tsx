"use client";

import { useEffect, useRef } from "react";
import { CategoryIcon } from "./icons";

export interface TabItem {
  id: string;
  title: string;
  /** Не задано — счётчик не показывается (например, у вкладки акций). */
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
}

/** Держит активный элемент горизонтальной ленты по центру. */
function useCenterActive(active: string) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const tab = scroller?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    if (!scroller || !tab) return;
    scroller.scrollTo({
      left: tab.offsetLeft - (scroller.clientWidth - tab.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [active]);
  return scrollerRef;
}

/** Категории — листы таблицы. Активная — белая плашка. */
export function CategoryTabs({ tabs, active, onSelect, label }: TabsProps) {
  const scrollerRef = useCenterActive(active);
  return (
    <div
      ref={scrollerRef}
      role="tablist"
      aria-label={label}
      className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pb-3"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            onClick={() => onSelect(tab.id)}
            className={`flex h-10 shrink-0 snap-start items-center gap-2 rounded-full pl-3.5 pr-4 text-sm font-bold transition-colors duration-200 active:scale-95 ${
              selected ? "btn-paper" : "border border-line text-ink/80 hover:border-line-strong hover:text-ink"
            }`}
          >
            <CategoryIcon id={tab.id} width={18} height={18} />
            <span className="whitespace-nowrap">{tab.title}</span>
            {tab.count !== undefined && (
              <span className={`text-xs font-bold tabular-nums ${selected ? "text-black/55" : "text-muted"}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Бренды внутри категории: строка поменьше под категориями. */
export function BrandChips({ tabs, active, onSelect, label }: TabsProps) {
  const scrollerRef = useCenterActive(active);
  return (
    <div
      ref={scrollerRef}
      role="tablist"
      aria-label={label}
      className="no-scrollbar -mx-4 flex snap-x gap-1.5 overflow-x-auto scroll-px-4 px-4 pb-3"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            onClick={() => onSelect(tab.id)}
            className={`flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200 active:scale-95 ${
              selected ? "bg-ink/90 text-on-paper" : "bg-surface-2 text-ink/75 hover:text-ink"
            }`}
          >
            <span className="whitespace-nowrap">{tab.title}</span>
            {tab.count !== undefined && (
              <span className={`text-[11px] tabular-nums ${selected ? "text-black/50" : "text-muted"}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

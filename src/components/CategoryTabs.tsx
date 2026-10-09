"use client";

import { useEffect, useRef } from "react";

export interface TabItem {
  id: string;
  title: string;
  icon: string;
  /** Не задано — счётчик не показывается (например, у вкладки акций). */
  count?: number;
}

interface CategoryTabsProps {
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
}

export function CategoryTabs({ tabs, active, onSelect }: CategoryTabsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Держим активный таб по центру ленты.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const tab = scroller?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    if (!scroller || !tab) return;
    scroller.scrollTo({
      left: tab.offsetLeft - (scroller.clientWidth - tab.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [active]);

  return (
    <div
      ref={scrollerRef}
      role="tablist"
      aria-label="Категории"
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
            className={`flex h-10 shrink-0 snap-start items-center gap-2 rounded-full px-4 text-sm font-bold transition-all duration-200 active:scale-95 ${
              selected ? "neon-button text-white" : "border border-line bg-surface-2/80 text-ink/75 hover:text-ink"
            }`}
          >
            <span aria-hidden>{tab.icon}</span>
            <span className="whitespace-nowrap">{tab.title}</span>
            {tab.count !== undefined && (
              <span
                className={`min-w-6 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  selected ? "bg-black/25 text-white" : "bg-white/[0.07] text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

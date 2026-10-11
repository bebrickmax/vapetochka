"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import type { StoreInfo } from "@/config/stores";
import { formatUpdatedAt, pluralize } from "@/lib/format";
import { usePersistentState, useScrolledPast } from "@/lib/hooks";
import { toProduct } from "@/lib/products";
import { buildHaystack, matches, parseQuery } from "@/lib/search";
import { telegramLink } from "@/lib/telegram";
import type { Catalog as CatalogData, ProductGroup } from "@/lib/types";
import { FloatingCart, HeaderCartButton } from "./cart/CartButtons";
import { CartDrawer } from "./cart/CartDrawer";
import { CartProvider } from "./cart/CartProvider";
import { BrandChips, CategoryTabs, type TabItem } from "./CategoryTabs";
import { EmptyState } from "./EmptyState";
import { ArrowUpIcon, TelegramIcon } from "./icons";
import { LineList, type LineEntry, type LineSection } from "./LineList";
import { Logo } from "./Logo";
import { PhotoViewerProvider } from "./ProductPhoto";
import { Promotions } from "./Promotions";
import { SearchBar } from "./SearchBar";
import { StockToggle } from "./StockToggle";
import { StoreSwitcher } from "./StoreSwitcher";
import { TelegramAnchor } from "./TelegramAnchor";

const ALL = "all";
const PROMO = "promo";
const ALL_BRANDS = "*";

interface IndexedItem {
  group: number;
  item: number;
  haystack: string;
  inStock: boolean;
}

/** Линейки в порядке таблицы, сгруппированные по ключу (бренд или категория). */
function groupBy(entries: LineEntry[], keyOf: (g: ProductGroup) => string): [string, LineEntry[]][] {
  const map = new Map<string, LineEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry.group);
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return [...map];
}

export function Catalog({ catalog, store }: { catalog: CatalogData; store: StoreInfo }) {
  const { categories, groups } = catalog;
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Поисковый индекс строится один раз на загрузку данных.
  const index = useMemo<IndexedItem[]>(
    () =>
      groups.flatMap((group, g) =>
        group.items.map((item, i) => ({
          group: g,
          item: i,
          haystack: buildHaystack(toProduct(group, i), categoryMap.get(group.categoryId)),
          inStock: item.status !== "out",
        })),
      ),
    [groups, categoryMap],
  );

  const [category, setCategory] = useState(categories[0]?.id ?? ALL);
  const [brand, setBrand] = useState(ALL_BRANDS);
  const [searchScope, setSearchScope] = useState(ALL);
  const [query, setQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = usePersistentState("vt:only-in-stock", true);
  // Фильтруем по отложенному запросу (ввод не тормозит), а вкладку выбираем по текущему.
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;
  const activeTab = query.trim() ? searchScope : category;

  // Категория из адреса (#liquids) — ссылкой на раздел можно поделиться.
  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.slice(1));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- адрес доступен только в браузере
    if (fromHash === ALL || fromHash === PROMO || categoryMap.has(fromHash)) setCategory(fromHash);
  }, [categoryMap]);

  // Позиции, прошедшие поиск и «только в наличии», — по линейкам.
  const { matched, hiddenByStock } = useMemo(() => {
    const parsed = parseQuery(deferredQuery);
    const byGroup = new Map<number, number[]>();
    let hidden = 0;
    for (const entry of index) {
      if (searching && !matches(entry.haystack, parsed)) continue;
      if (onlyInStock && !entry.inStock) {
        hidden++;
        continue;
      }
      const list = byGroup.get(entry.group);
      if (list) list.push(entry.item);
      else byGroup.set(entry.group, [entry.item]);
    }
    return { matched: byGroup, hiddenByStock: hidden };
  }, [index, deferredQuery, searching, onlyInStock]);

  const entries = useMemo<LineEntry[]>(
    () => [...matched].map(([g, visible]) => ({ group: groups[g], visible })),
    [matched, groups],
  );

  const tabs = useMemo<TabItem[]>(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.group.categoryId, (counts.get(e.group.categoryId) ?? 0) + e.visible.length);
    const categoryTabs = categories.map((c) => ({ id: c.id, title: c.title, count: counts.get(c.id) ?? 0 }));
    // Во время поиска пустые вкладки прячем, чтобы сразу было видно, где нашлось.
    const visibleTabs = searching ? categoryTabs.filter((t) => t.count > 0 || t.id === activeTab) : categoryTabs;
    const total = entries.reduce((sum, e) => sum + e.visible.length, 0);
    const showPromo = !searching || activeTab === PROMO;
    return [
      ...(showPromo ? [{ id: PROMO, title: "Акции и ОПТ" }] : []),
      ...visibleTabs,
      { id: ALL, title: "Всё сразу", count: total },
    ];
  }, [entries, categories, searching, activeTab]);

  const inTab = useMemo(
    () => (activeTab === ALL ? entries : entries.filter((e) => e.group.categoryId === activeTab)),
    [entries, activeTab],
  );

  // Бренды текущей категории (в порядке таблицы) — показываем, если их хотя бы два.
  const brandTabs = useMemo<TabItem[]>(() => {
    if (searching || activeTab === ALL || activeTab === PROMO) return [];
    const families = groupBy(inTab, (g) => g.family ?? "");
    if (families.length < 2) return [];
    const total = inTab.reduce((sum, e) => sum + e.visible.length, 0);
    return [
      { id: ALL_BRANDS, title: "Все бренды", count: total },
      ...families.map(([family, list]) => ({
        id: family,
        title: family || "Другое",
        count: list.reduce((sum, e) => sum + e.visible.length, 0),
      })),
    ];
  }, [inTab, searching, activeTab]);

  const activeBrand = brandTabs.some((t) => t.id === brand) ? brand : ALL_BRANDS;

  const sections = useMemo<LineSection[]>(() => {
    if (activeTab === ALL) {
      return groupBy(inTab, (g) => g.categoryId).map(([id, list]) => ({
        key: id,
        title: categoryMap.get(id)?.title,
        categoryId: id,
        entries: list,
      }));
    }
    if (activeBrand !== ALL_BRANDS) {
      return [{ key: activeBrand, entries: inTab.filter((e) => (e.group.family ?? "") === activeBrand) }];
    }
    if (brandTabs.length > 0) {
      return groupBy(inTab, (g) => g.family ?? "").map(([family, list]) => ({
        key: family,
        title: family || "Другое",
        entries: list,
      }));
    }
    return [{ key: activeTab, entries: inTab }];
  }, [activeTab, activeBrand, inTab, brandTabs.length, categoryMap]);

  const visibleCount = sections.reduce((sum, s) => sum + s.entries.reduce((n, e) => n + e.visible.length, 0), 0);

  const hiddenInTab = useMemo(() => {
    if (!onlyInStock || hiddenByStock === 0) return 0;
    const parsed = parseQuery(deferredQuery);
    return index.filter((entry) => {
      if (entry.inStock) return false;
      const group = groups[entry.group];
      if (activeTab !== ALL && group.categoryId !== activeTab) return false;
      if (activeBrand !== ALL_BRANDS && (group.family ?? "") !== activeBrand) return false;
      return !searching || matches(entry.haystack, parsed);
    }).length;
  }, [index, groups, onlyInStock, hiddenByStock, deferredQuery, searching, activeTab, activeBrand]);

  const stickyRef = useRef<HTMLDivElement>(null);
  const scrollToListTop = () => {
    const top = stickyRef.current?.offsetTop ?? 0;
    if (window.scrollY > top) window.scrollTo({ top });
  };

  const selectTab = (id: string) => {
    if (query.trim()) setSearchScope(id);
    else {
      setCategory(id);
      setBrand(ALL_BRANDS);
      window.history.replaceState(null, "", `#${id}`);
    }
    scrollToListTop();
  };

  const selectBrand = (id: string) => {
    setBrand(id);
    scrollToListTop();
  };

  const changeQuery = (value: string) => {
    if (!query.trim() && value.trim()) setSearchScope(ALL); // новый поиск — по всем категориям
    setQuery(value);
  };

  const showPromotions = activeTab === PROMO;
  const scrolled = useScrolledPast(900);

  return (
    <CartProvider storeId={store.id}>
      <PhotoViewerProvider>
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
          {/* Шапка с логотипом — уезжает при прокрутке */}
          <header className="flex items-start justify-between gap-3 px-4 pb-4 pt-[max(env(safe-area-inset-top),1.25rem)]">
            <div className="min-w-0 space-y-3">
              <Logo className="h-9 w-auto text-ink" />
              <StoreSwitcher store={store} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TelegramAnchor
                link={telegramLink()}
                aria-label="Написать менеджеру в Telegram"
                className="flex size-11 items-center justify-center rounded-full border border-line-strong text-ink transition active:scale-95"
              >
                <TelegramIcon />
              </TelegramAnchor>
              <HeaderCartButton />
            </div>
          </header>

          {/* Липкая панель: поиск, категории, бренды */}
          <div
            ref={stickyRef}
            className="sticky top-0 z-30 border-b border-line bg-bg/85 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-xl"
          >
            <SearchBar value={query} onChange={changeQuery} />
            <div className="h-3" />
            <CategoryTabs tabs={tabs} active={activeTab} onSelect={selectTab} label="Категории" />
            {brandTabs.length > 0 && (
              <BrandChips tabs={brandTabs} active={activeBrand} onSelect={selectBrand} label="Бренды" />
            )}
          </div>

          <main className="flex-1 px-4 pb-[calc(max(env(safe-area-inset-bottom),1.25rem)+4.5rem)]">
            {showPromotions ? (
              <div className="py-4">
                <Promotions wholesale={catalog.wholesale} />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 py-4">
                  <p className="text-sm text-muted" aria-live="polite">
                    <span className="font-bold tabular-nums text-ink">{visibleCount}</span>{" "}
                    {pluralize(visibleCount, ["позиция", "позиции", "позиций"])}
                  </p>
                  <StockToggle checked={onlyInStock} onChange={setOnlyInStock} />
                </div>

                {visibleCount > 0 ? (
                  <LineList
                    key={`${activeTab}|${activeBrand}|${deferredQuery}|${onlyInStock}`}
                    sections={sections}
                    expanded={searching}
                  />
                ) : (
                  <EmptyState
                    query={deferredQuery}
                    hiddenOutOfStock={hiddenInTab}
                    onShowAll={() => setOnlyInStock(false)}
                  />
                )}
              </>
            )}

            <footer className="mt-12 space-y-2 pb-4 text-center text-xs leading-relaxed text-muted">
              <p>
                {store.title}: наличие и цены обновляются автоматически, последнее обновление{" "}
                {formatUpdatedAt(catalog.updatedAt)}
              </p>
              {catalog.source === "demo" && (
                <p className="text-ink">Демо-режим: показаны примерные данные, таблица не подключена.</p>
              )}
              <p>
                Заказ через{" "}
                <TelegramAnchor link={telegramLink()} className="font-semibold text-ink underline underline-offset-2">
                  @{siteConfig.telegramManager}
                </TelegramAnchor>
              </p>
              <p>Продажа только лицам старше 18 лет.</p>
            </footer>
          </main>

          <button
            type="button"
            aria-label="Наверх"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-4 z-40 flex size-14 items-center justify-center rounded-full border border-line-strong bg-raised/95 text-ink shadow-lg backdrop-blur transition-all duration-300 active:scale-90 ${
              scrolled ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
            }`}
          >
            <ArrowUpIcon />
          </button>

          <FloatingCart />
          <CartDrawer store={store} />
        </div>
      </PhotoViewerProvider>
    </CartProvider>
  );
}

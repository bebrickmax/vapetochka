"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import { formatUpdatedAt, pluralize } from "@/lib/format";
import { usePersistentState, useScrolledPast } from "@/lib/hooks";
import { flattenGroups } from "@/lib/products";
import { buildHaystack, matches, parseQuery } from "@/lib/search";
import { telegramLink } from "@/lib/telegram";
import type { Catalog as CatalogData, Product } from "@/lib/types";
import { FloatingCart, HeaderCartButton } from "./cart/CartButtons";
import { CartDrawer } from "./cart/CartDrawer";
import { CartProvider } from "./cart/CartProvider";
import { CategoryTabs, type TabItem } from "./CategoryTabs";
import { EmptyState } from "./EmptyState";
import { ArrowUpIcon, TelegramIcon } from "./icons";
import { ProductGrid } from "./ProductGrid";
import { Promotions } from "./Promotions";
import { SearchBar } from "./SearchBar";
import { StockToggle } from "./StockToggle";
import { TelegramAnchor } from "./TelegramAnchor";

const ALL = "all";
const PROMO = "promo";

interface IndexedProduct {
  product: Product;
  haystack: string;
}

export function Catalog({ catalog }: { catalog: CatalogData }) {
  const { categories } = catalog;
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Поисковый индекс строится один раз на загрузку данных.
  const index = useMemo<IndexedProduct[]>(
    () =>
      flattenGroups(catalog.groups).map((product) => ({
        product,
        haystack: buildHaystack(product, categoryMap.get(product.categoryId)),
      })),
    [catalog.groups, categoryMap],
  );

  const [category, setCategory] = useState(categories[0]?.id ?? ALL);
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

  // Найденное по запросу и наличию — без учёта выбранной вкладки (для счётчиков).
  const { matched, hiddenByStock } = useMemo(() => {
    const parsed = parseQuery(deferredQuery);
    const byQuery = searching ? index.filter((p) => matches(p.haystack, parsed)) : index;
    const result = onlyInStock ? byQuery.filter((p) => p.product.status === "in") : byQuery;
    return { matched: result.map((p) => p.product), hiddenByStock: byQuery.length - result.length };
  }, [index, deferredQuery, searching, onlyInStock]);

  const tabs = useMemo<TabItem[]>(() => {
    const counts = new Map<string, number>();
    for (const p of matched) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    const categoryTabs = categories.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
    // Во время поиска пустые вкладки прячем, чтобы сразу было видно, где нашлось.
    const visibleTabs = searching ? categoryTabs.filter((t) => t.count > 0 || t.id === activeTab) : categoryTabs;
    const promoTab = { id: PROMO, title: "Акции и ОПТ", icon: "🎁" };
    const showPromo = !searching || activeTab === PROMO;
    return [
      { id: ALL, title: "Все", icon: "✨", count: matched.length },
      ...(showPromo ? [promoTab] : []),
      ...visibleTabs,
    ];
  }, [matched, categories, searching, activeTab]);

  const visible = useMemo(
    () => (activeTab === ALL ? matched : matched.filter((p) => p.categoryId === activeTab)),
    [matched, activeTab],
  );

  const hiddenInTab = useMemo(() => {
    if (!onlyInStock || hiddenByStock === 0) return 0;
    const parsed = parseQuery(deferredQuery);
    return index.filter(
      (p) =>
        p.product.status !== "in" &&
        (activeTab === ALL || p.product.categoryId === activeTab) &&
        (!searching || matches(p.haystack, parsed)),
    ).length;
  }, [index, onlyInStock, hiddenByStock, deferredQuery, searching, activeTab]);

  const stickyRef = useRef<HTMLDivElement>(null);
  const scrollToListTop = () => {
    const top = stickyRef.current?.offsetTop ?? 0;
    if (window.scrollY > top) window.scrollTo({ top });
  };

  const selectTab = (id: string) => {
    if (query.trim()) setSearchScope(id);
    else {
      setCategory(id);
      window.history.replaceState(null, "", `#${id}`);
    }
    scrollToListTop();
  };

  const changeQuery = (value: string) => {
    if (!query.trim() && value.trim()) setSearchScope(ALL); // новый поиск — по всем категориям
    setQuery(value);
  };

  const showCategoryOnCards = activeTab === ALL;
  const showPromotions = activeTab === PROMO;
  const scrolled = useScrolledPast(900);

  return (
    <CartProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
        {/* Шапка с логотипом — уезжает при прокрутке */}
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),1rem)]">
          <div>
            <p className="text-[26px] font-black leading-none tracking-tight">
              Vape<span className="neon-text">Tochka</span>
            </p>
            <p className="mt-1 text-xs font-medium text-muted">Каталог · заказ в Telegram</p>
          </div>
          <div className="flex items-center gap-2">
            <TelegramAnchor
              link={telegramLink()}
              aria-label="Написать менеджеру в Telegram"
              className="flex h-11 items-center gap-2 rounded-2xl border border-line bg-surface-2/80 px-3.5 text-sm font-bold text-ink transition active:scale-95"
            >
              <TelegramIcon className="text-neon-cyan" />
              <span className="hidden min-[380px]:inline">Менеджер</span>
            </TelegramAnchor>
            <HeaderCartButton />
          </div>
        </div>

        {/* Липкая панель: поиск + категории */}
        <div
          ref={stickyRef}
          className="sticky top-0 z-30 border-b border-line bg-bg/80 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-xl backdrop-saturate-150"
        >
          <SearchBar value={query} onChange={changeQuery} />
          <div className="h-3" />
          <CategoryTabs tabs={tabs} active={activeTab} onSelect={selectTab} />
        </div>

        <main className="flex-1 px-4 pb-[calc(max(env(safe-area-inset-bottom),1.25rem)+4rem)]">
          {showPromotions ? (
            <div className="py-3">
              <Promotions wholesale={catalog.wholesale} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 py-3">
                <p className="text-sm text-muted" aria-live="polite">
                  <span className="font-bold tabular-nums text-ink">{visible.length}</span>{" "}
                  {pluralize(visible.length, ["позиция", "позиции", "позиций"])}
                </p>
                <StockToggle checked={onlyInStock} onChange={setOnlyInStock} />
              </div>

              {visible.length > 0 ? (
                <ProductGrid
                  key={`${activeTab}|${deferredQuery}|${onlyInStock}`}
                  products={visible}
                  categories={showCategoryOnCards ? categoryMap : undefined}
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

          <footer className="mt-10 space-y-2 pb-4 text-center text-xs text-muted">
            <p>Наличие и цены обновляются автоматически · {formatUpdatedAt(catalog.updatedAt)}</p>
            {catalog.source === "demo" && (
              <p className="text-amber">Демо-режим: показаны примерные данные, таблица не подключена.</p>
            )}
            <p>
              Заказ через{" "}
              <TelegramAnchor link={telegramLink()} className="font-semibold text-neon-cyan">
                @{siteConfig.telegramManager}
              </TelegramAnchor>
            </p>
            <p className="text-muted/60">Продажа только лицам старше 18 лет.</p>
          </footer>
        </main>

        <button
          type="button"
          aria-label="Наверх"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-4 z-40 flex size-12 items-center justify-center rounded-full border border-line bg-surface-2/90 text-ink shadow-lg backdrop-blur transition-all duration-300 active:scale-90 ${
            scrolled ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
          }`}
        >
          <ArrowUpIcon />
        </button>

        <FloatingCart />
        <CartDrawer />
      </div>
    </CartProvider>
  );
}

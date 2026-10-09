"use client";

import { useEffect, useRef, useState } from "react";
import type { Category, Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";

const PAGE_SIZE = 30;

interface ProductGridProps {
  products: Product[];
  /** Если передано — на карточках показывается категория. */
  categories?: Map<string, Category>;
}

/**
 * Сетка карточек с постепенной подгрузкой: в DOM попадает только то,
 * до чего пользователь долистал, — тысячи позиций не тормозят телефон.
 * Сбрасывается через `key` при смене фильтров.
 */
export function ProductGrid({ products, categories }: ProductGridProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = limit < products.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE_SIZE);
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, limit]);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.slice(0, limit).map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            index={index}
            category={categories?.get(product.categoryId)}
          />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden />}
    </>
  );
}

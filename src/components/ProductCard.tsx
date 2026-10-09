import { memo } from "react";
import { formatPrice } from "@/lib/format";
import { displayLine } from "@/lib/products";
import { orderMessage, telegramLink } from "@/lib/telegram";
import type { Category, Product, StockStatus } from "@/lib/types";
import { BellIcon, TelegramIcon } from "./icons";
import { TelegramAnchor } from "./TelegramAnchor";

const STATUS: Record<StockStatus, { label: string; dot: string; text: string }> = {
  in: {
    label: "В наличии",
    dot: "bg-neon-green shadow-[0_0_10px_2px] shadow-neon-green/60",
    text: "text-neon-green",
  },
  out: { label: "Ожидается", dot: "bg-muted/60", text: "text-muted" },
  unknown: { label: "Уточняйте", dot: "bg-amber shadow-[0_0_8px_1px] shadow-amber/50", text: "text-amber" },
};

interface ProductCardProps {
  product: Product;
  /** Показывать категорию (в режиме поиска по всем листам). */
  category?: Category;
  index: number;
}

function ProductCardBase({ product, category, index }: ProductCardProps) {
  const status = STATUS[product.status];
  const available = product.status === "in";
  const title = product.line ? displayLine(product.line, product.strength) : product.name;
  const subtitle = product.line ? product.name : undefined;
  const link = telegramLink(orderMessage(product));

  return (
    <article
      className={`animate-card-in relative flex flex-col gap-3 rounded-3xl border border-line bg-surface/90 p-4 ${
        available ? "" : "opacity-75"
      }`}
      style={{ animationDelay: `${Math.min(index % 30, 8) * 35}ms` }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {(category || product.brand) && (
            <p className="mb-1 flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-muted">
              {category && (
                <span>
                  {category.icon} {category.title}
                </span>
              )}
              {category && product.brand && <span aria-hidden>·</span>}
              {product.brand && <span className="truncate">{product.brand}</span>}
            </p>
          )}
          <h3 className="text-[19px] font-extrabold leading-tight tracking-tight text-ink">{title}</h3>
        </div>
        {product.strength && (
          <span className="shrink-0 rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-2.5 py-1 text-xs font-bold text-neon-cyan">
            {product.strength}
          </span>
        )}
      </header>

      {(subtitle || product.description || product.variant || product.note) && (
        <div className="-mt-1 space-y-1">
          {subtitle && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold leading-snug text-ink/90">
              {product.emoji && <span aria-hidden>{product.emoji}</span>}
              <span>{subtitle}</span>
              {product.variant && <VariantChip>{product.variant}</VariantChip>}
            </p>
          )}
          {!subtitle && product.variant && <VariantChip>{product.variant}</VariantChip>}
          {product.description && <p className="text-sm leading-snug text-muted">{product.description}</p>}
          {product.note && <p className="text-xs text-muted/80">{product.note}</p>}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {product.price !== null ? (
              <span className="text-2xl font-black tracking-tight text-ink">{formatPrice(product.price)}</span>
            ) : (
              <span className="text-base font-bold text-muted">Цена по запросу</span>
            )}
            {product.oldPrice !== undefined && (
              <span className="text-sm font-semibold text-muted line-through">{formatPrice(product.oldPrice)}</span>
            )}
          </div>
          <p className={`mt-0.5 flex items-center gap-1.5 text-xs font-semibold ${status.text}`}>
            <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
            {status.label}
          </p>
        </div>

        {available ? (
          <TelegramAnchor
            link={link}
            className="neon-button flex h-12 min-w-[48%] shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-white transition-transform active:scale-[0.96]"
          >
            <TelegramIcon />
            Заказать
          </TelegramAnchor>
        ) : (
          <TelegramAnchor
            link={link}
            aria-label="Узнать о поступлении"
            className="flex h-12 min-w-[48%] shrink-0 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 text-sm font-semibold text-ink/70 transition-transform active:scale-[0.96]"
          >
            <BellIcon width={18} height={18} />
            Когда будет?
          </TelegramAnchor>
        )}
      </div>
    </article>
  );
}

function VariantChip({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-lg bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-ink/80">
      {children}
    </span>
  );
}

export const ProductCard = memo(ProductCardBase);

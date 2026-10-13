"use client";

import { memo, useState } from "react";
import { formatPrice, pluralize } from "@/lib/format";
import { displayLine, toProduct } from "@/lib/products";
import { orderMessage, telegramLink } from "@/lib/telegram";
import type { Category, ProductGroup, ProductItem } from "@/lib/types";
import { AddToCart } from "./cart/AddToCart";
import { FavoriteButton } from "./Favorites";
import { BellIcon, CategoryIcon, ChevronDownIcon } from "./icons";
import { ProductPhoto } from "./ProductPhoto";
import { TelegramAnchor } from "./TelegramAnchor";

/** Сколько позиций видно сразу; остальные — по кнопке «Ещё…». */
const COLLAPSED_ROWS = 6;

interface LineCardProps {
  group: ProductGroup;
  /** Индексы позиций, прошедших фильтры (поиск, «только в наличии»). */
  visible: number[];
  /** Показать категорию над названием (вкладка «Все» и поиск). */
  category?: Category;
  /** Развернуть все позиции сразу (например, при поиске). */
  expanded?: boolean;
  /** Бренд уже написан в заголовке раздела — над названием его не повторяем. */
  hideFamily?: boolean;
}

/** Название линейки начинается с бренда: «Drymost 5mg» и Drymost. */
export function startsWithFamily(title: string, family: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return norm(title).startsWith(norm(family));
}

/** Самая частая цена — её показываем в шапке, а у позиций — только отличающуюся. */
function headlinePrice(items: ProductItem[]): number | null {
  const counts = new Map<number, number>();
  for (const item of items) if (item.price !== null) counts.set(item.price, (counts.get(item.price) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [price, count] of counts) if (count > bestCount) [best, bestCount] = [price, count];
  return best;
}

function LineCardBase({ group, visible, category, expanded = false, hideFamily = false }: LineCardProps) {
  const [open, setOpen] = useState(expanded);
  const title = group.line ? displayLine(group.line, group.strength) : group.family ?? "";
  const items = group.items;
  const inStock = items.filter((i) => i.status === "in").length;

  const prices = [...new Set(items.map((i) => i.price).filter((p): p is number => p !== null))];
  const main = headlinePrice(items);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const oldPrice = items.find((i) => i.price === main && i.oldPrice !== undefined)?.oldPrice;

  // Несколько разных фото внутри линейки (испарители, картриджи) — показываем их у позиций.
  const itemPhotos = new Set(items.map((i) => i.image).filter(Boolean)).size > 1;
  // Бренд над названием — если название само с него не начинается («Tasty Lab» над «Рик и Морти»).
  const family = group.family;
  const above = !hideFamily && family && !startsWithFamily(title, family) ? family : undefined;

  const collapsible = !open && visible.length > COLLAPSED_ROWS + 2;
  const shown = collapsible ? visible.slice(0, COLLAPSED_ROWS) : visible;

  return (
    <article className="overflow-hidden rounded-[26px] border border-line bg-surface">
      <header className="flex gap-4 p-4">
        <ProductPhoto
          src={group.image}
          alt={[group.brand, group.line].filter(Boolean).join(" ")}
          className="h-[118px] w-[92px] shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {(category || above) && (
                <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted">
                  {category && <CategoryIcon id={category.id} width={15} height={15} className="shrink-0" />}
                  <span className="truncate">{[category?.title, above].filter(Boolean).join(", ")}</span>
                </p>
              )}
              <h3 className="font-wide mt-0.5 text-[17px] font-semibold leading-[1.2] text-ink [overflow-wrap:anywhere]">
                {title}
              </h3>
            </div>
            <FavoriteButton id={group.id} title={group.line} />
          </div>
          {(group.strength || group.section || group.note) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.strength && <Chip strong>{group.strength}</Chip>}
              {group.section && <Chip>{group.section}</Chip>}
              {group.note && <Chip>{group.note}</Chip>}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
            {main !== null ? (
              <span className="font-wide text-[21px] font-semibold tabular-nums">
                {prices.length > 1 && minPrice !== main ? `от ${formatPrice(minPrice!)}` : formatPrice(main)}
              </span>
            ) : (
              <span className="text-[15px] font-bold text-muted">Цена по запросу</span>
            )}
            {oldPrice !== undefined && (
              <span className="text-sm font-semibold text-muted line-through">{formatPrice(oldPrice)}</span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {inStock > 0
              ? `${inStock} из ${items.length} в наличии`
              : "Сейчас нет в наличии"}
          </p>
        </div>
      </header>

      <ul className="border-t border-line">
        {shown.map((itemIndex, i) => {
          const item = items[itemIndex];
          const prev = i > 0 ? items[shown[i - 1]] : undefined;
          const continuation = !!prev && prev.name === item.name && !!item.variant;
          return (
            <ItemRow
              key={itemIndex}
              group={group}
              itemIndex={itemIndex}
              showPrice={item.price !== main || item.oldPrice !== undefined}
              continuation={continuation}
              photo={itemPhotos && !continuation ? item.image : undefined}
              photoSlot={itemPhotos}
            />
          );
        })}
      </ul>

      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-bold text-ink transition active:bg-white/5"
        >
          Ещё {visible.length - COLLAPSED_ROWS} {pluralize(visible.length - COLLAPSED_ROWS, ["позиция", "позиции", "позиций"])}
          <ChevronDownIcon width={18} height={18} />
        </button>
      )}
    </article>
  );
}

interface ItemRowProps {
  group: ProductGroup;
  itemIndex: number;
  showPrice: boolean;
  /** То же название, что строкой выше — показываем только вариант (сопротивление и т.п.). */
  continuation: boolean;
  photo?: string;
  /** Оставить место под фото, чтобы строки линейки стояли ровно. */
  photoSlot: boolean;
}

function ItemRow({ group, itemIndex, showPrice, continuation, photo, photoSlot }: ItemRowProps) {
  const item = group.items[itemIndex];
  const product = toProduct(group, itemIndex);
  const out = item.status === "out";

  return (
    <li
      className={`flex items-center gap-3 px-4 ${continuation ? "py-1.5" : "border-t border-line py-2.5 first:border-t-0"}`}
    >
      {photoSlot &&
        (photo ? (
          <ProductPhoto src={photo} alt={`${group.line} ${item.name}`} size={160} className="size-11 shrink-0 rounded-xl" />
        ) : (
          <span className="w-11 shrink-0" aria-hidden />
        ))}

      <div className={`min-w-0 flex-1 ${out ? "opacity-45" : ""}`}>
        {continuation ? (
          <p className="text-[14px] font-semibold text-ink/85">{item.variant}</p>
        ) : (
          <>
            <p className="text-[15px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
              {item.emoji && (
                <span aria-hidden className="mr-1.5 text-[13px]">
                  {item.emoji}
                </span>
              )}
              {item.name}
            </p>
            {item.variant && (
              <div className="mt-1">
                <Chip>{item.variant}</Chip>
              </div>
            )}
            {item.description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{item.description}</p>}
          </>
        )}
        {(showPrice || item.status !== "in") && (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
            {out && (
              <span className="rounded-full border border-line-strong px-2 py-px text-[11px] font-bold uppercase tracking-wide text-ink">
                Нет в наличии
              </span>
            )}
            {showPrice && (
              <span className="font-bold tabular-nums text-ink">
                {item.price !== null ? formatPrice(item.price) : "Цена по запросу"}
              </span>
            )}
            {item.oldPrice !== undefined && (
              <span className="font-semibold text-muted line-through">{formatPrice(item.oldPrice)}</span>
            )}
            {item.status === "unknown" && <span className="text-muted">наличие уточняйте</span>}
          </p>
        )}
      </div>

      {out ? (
        <TelegramAnchor
          link={telegramLink(orderMessage(product))}
          aria-label={`Узнать о поступлении: ${item.name}`}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted transition active:bg-white/10"
        >
          <BellIcon width={16} height={16} />
          Когда будет?
        </TelegramAnchor>
      ) : (
        <AddToCart product={product} />
      )}
    </li>
  );
}

function Chip({ children, strong = false }: { children: string; strong?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
        strong ? "btn-paper" : "border border-line-strong text-ink/80"
      }`}
    >
      {children}
    </span>
  );
}

export const LineCard = memo(LineCardBase);

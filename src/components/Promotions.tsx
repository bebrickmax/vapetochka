"use client";

import { useState } from "react";
import { promoSections } from "@/config/promotions";
import { formatPrice } from "@/lib/format";
import { telegramLink } from "@/lib/telegram";
import type { ProductGroup, Wholesale } from "@/lib/types";
import { TelegramIcon } from "./icons";
import { TelegramAnchor } from "./TelegramAnchor";

type Section = "promo" | "wholesale";

const SECTIONS: { id: Section; title: string; icon: string }[] = [
  { id: "promo", title: "Акции", icon: "🎁" },
  { id: "wholesale", title: "ОПТ", icon: "📦" },
];

/** Вкладка «Акции и ОПТ»: переключатель между акциями и оптовыми ценами. */
export function Promotions({ wholesale }: { wholesale?: Wholesale }) {
  const [section, setSection] = useState<Section>("promo");

  return (
    <div className="space-y-5 pt-1">
      <div
        role="tablist"
        aria-label="Акции и ОПТ"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface-2/80 p-1"
      >
        {SECTIONS.map((item) => {
          const selected = item.id === section;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSection(item.id)}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-[0.97] ${
                selected ? "neon-button text-white" : "text-ink/75 hover:text-ink"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.title}
            </button>
          );
        })}
      </div>
      {section === "promo" ? <PromoList /> : <WholesaleList wholesale={wholesale} />}
    </div>
  );
}

function PromoList() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="rounded-3xl border border-neon-violet/30 bg-linear-to-br from-neon-pink/15 via-neon-violet/10 to-transparent p-4">
        <p className="text-lg font-black tracking-tight">
          🎁 Акции <span className="neon-text">и подарки</span>
        </p>
        <p className="mt-1 text-sm text-ink/75">
          Добавляйте товары в корзину, а подарок по акции уточните у менеджера при оформлении заказа.
        </p>
      </div>

      {promoSections.map((section) => (
        <section key={section.id} aria-labelledby={`promo-${section.id}`} className="space-y-3">
          <h2 id={`promo-${section.id}`} className="flex items-center gap-2 text-base font-extrabold tracking-tight">
            <span aria-hidden>{section.icon}</span>
            {section.title}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.promos.map((promo, i) => (
              <li
                key={i}
                className="animate-card-in flex gap-3 rounded-3xl border border-line bg-surface/90 p-4"
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neon-green/15 text-sm font-black text-neon-green"
                >
                  ✓
                </span>
                <div className="min-w-0 space-y-1.5">
                  {promo.formula && (
                    <p className="neon-text text-xl font-black leading-none tracking-tight">{promo.formula}</p>
                  )}
                  <p className="text-[15px] leading-snug text-ink/90">{promo.text}</p>
                  {promo.also && (
                    <p className="rounded-xl bg-white/[0.05] px-2.5 py-1.5 text-[13px] leading-snug text-muted">
                      {promo.also}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WholesaleList({ wholesale }: { wholesale?: Wholesale }) {
  const hasData = !!wholesale && (wholesale.groups.length > 0 || wholesale.lines.length > 0);

  return (
    <div className="animate-fade-in space-y-5">
      <div className="space-y-3 rounded-3xl border border-neon-cyan/30 bg-linear-to-br from-neon-cyan/15 via-neon-violet/10 to-transparent p-4">
        <div>
          <p className="text-lg font-black tracking-tight">
            📦 Оптовые <span className="neon-text">цены</span>
          </p>
          <p className="mt-1 text-sm text-ink/75">
            {hasData
              ? "Для заказа оптом напишите менеджеру: подтвердим наличие и итоговую цену."
              : "Оптовые цены уточняйте у менеджера — подберём позиции и посчитаем стоимость."}
          </p>
        </div>
        <TelegramAnchor
          link={telegramLink("Здравствуйте! Интересует заказ оптом.")}
          className="neon-button flex h-12 items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition-transform active:scale-[0.97]"
        >
          <TelegramIcon />
          Заказать оптом
        </TelegramAnchor>
      </div>

      {wholesale && wholesale.groups.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {wholesale.groups.map((group, i) => (
            <WholesaleCard key={i} group={group} index={i} />
          ))}
        </ul>
      )}

      {wholesale && wholesale.lines.length > 0 && (
        <ul className="space-y-2 rounded-3xl border border-line bg-surface/90 p-4">
          {wholesale.lines.map((line, i) => (
            <li key={i} className="text-[15px] leading-snug text-ink/90">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WholesaleCard({ group, index }: { group: ProductGroup; index: number }) {
  const prices = [...new Set(group.items.map((item) => item.price).filter((p): p is number => p !== null))];
  return (
    <li
      className="animate-card-in flex flex-col gap-3 rounded-3xl border border-line bg-surface/90 p-4"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {group.brand && (
            <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{group.brand}</p>
          )}
          <h3 className="text-[17px] font-extrabold leading-tight tracking-tight text-ink">{group.line}</h3>
          {group.note && <p className="mt-1 text-xs text-muted">{group.note}</p>}
        </div>
        {prices.length === 1 && (
          <span className="shrink-0 text-xl font-black tracking-tight text-neon-cyan">{formatPrice(prices[0])}</span>
        )}
      </div>
      <ul className="space-y-1.5">
        {group.items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-ink/85">
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${
                item.status === "in" ? "bg-neon-green" : item.status === "out" ? "bg-muted/60" : "bg-amber"
              }`}
            />
            <span className="min-w-0 flex-1">
              {item.emoji && <span aria-hidden>{item.emoji} </span>}
              {item.name}
              {item.variant && <span className="text-muted"> · {item.variant}</span>}
            </span>
            {prices.length > 1 && item.price !== null && (
              <span className="shrink-0 font-bold tabular-nums">{formatPrice(item.price)}</span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

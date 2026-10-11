"use client";

import { useState } from "react";
import { promoSections } from "@/config/promotions";
import { formatPrice } from "@/lib/format";
import { telegramLink } from "@/lib/telegram";
import type { Wholesale, WholesaleItem } from "@/lib/types";
import { TelegramIcon } from "./icons";
import { ProductPhoto } from "./ProductPhoto";
import { TelegramAnchor } from "./TelegramAnchor";

type Section = "promo" | "wholesale";

const SECTIONS: { id: Section; title: string }[] = [
  { id: "promo", title: "Акции" },
  { id: "wholesale", title: "Опт" },
];

/** Вкладка «Акции и ОПТ»: переключатель между акциями и оптовыми ценами. */
export function Promotions({ wholesale }: { wholesale?: Wholesale }) {
  const [section, setSection] = useState<Section>("promo");

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Акции и опт" className="grid grid-cols-2 gap-1 rounded-full border border-line p-1">
        {SECTIONS.map((item) => {
          const selected = item.id === section;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSection(item.id)}
              className={`h-10 rounded-full text-sm font-bold transition active:scale-[0.97] ${
                selected ? "btn-paper" : "text-ink/75 hover:text-ink"
              }`}
            >
              {item.title}
            </button>
          );
        })}
      </div>
      {section === "promo" ? <PromoList /> : <WholesaleView wholesale={wholesale} />}
    </div>
  );
}

function PromoList() {
  return (
    <div className="animate-fade-in space-y-8">
      <p className="max-w-xl text-[15px] leading-relaxed text-ink/80">
        Собирайте корзину как обычно, а подарок по акции назовите менеджеру при оформлении заказа.
      </p>

      {promoSections.map((section) => (
        <section key={section.id} aria-labelledby={`promo-${section.id}`} className="space-y-3">
          <h2 id={`promo-${section.id}`} className="font-wide px-1 text-[19px] font-semibold leading-tight">
            {section.title}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.promos.map((promo, i) => (
              <li key={i} className="flex gap-4 rounded-[24px] border border-line bg-surface p-4">
                {promo.formula && (
                  <span className="font-wide flex h-12 min-w-16 shrink-0 items-center justify-center rounded-2xl bg-paper px-2.5 text-[17px] font-bold text-on-paper">
                    {promo.formula}
                  </span>
                )}
                <div className="min-w-0 space-y-2">
                  <p className="text-[15px] leading-snug text-ink/90">{promo.text}</p>
                  {promo.also && <p className="text-[13px] leading-snug text-muted">{promo.also}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WholesaleView({ wholesale }: { wholesale?: Wholesale }) {
  const sections = wholesale?.sections ?? [];
  const [active, setActive] = useState(0);
  const current = sections[Math.min(active, sections.length - 1)];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 rounded-[24px] border border-line-strong p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-[15px] leading-relaxed text-ink/85">
          {sections.length > 0
            ? "Цена за штуку зависит от общего количества. Напишите менеджеру — подтвердим наличие и посчитаем заказ."
            : "Оптовые цены уточняйте у менеджера — подберём позиции и посчитаем стоимость."}
        </p>
        <TelegramAnchor
          link={telegramLink("Здравствуйте! Интересует заказ оптом.")}
          className="btn-paper flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-base font-bold transition-transform active:scale-[0.97]"
        >
          <TelegramIcon />
          Заказать оптом
        </TelegramAnchor>
      </div>

      {sections.length > 1 && (
        <div role="tablist" aria-label="Разделы опта" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {sections.map((section, i) => {
            const selected = section === current;
            return (
              <button
                key={section.title || i}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(i)}
                className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-bold transition active:scale-95 ${
                  selected ? "bg-ink/90 text-on-paper" : "bg-surface-2 text-ink/75"
                }`}
              >
                {section.title || "Позиции"}
              </button>
            );
          })}
        </div>
      )}

      {current && wholesale && (
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {current.brands.map((brand, i) => (
            <section key={`${brand.title}-${i}`} className="overflow-hidden rounded-[24px] border border-line bg-surface">
              {brand.title && (
                <h3 className="font-wide border-b border-line px-4 py-3 text-[16px] font-semibold">{brand.title}</h3>
              )}
              <ul>
                {brand.items.map((item, j) => (
                  <WholesaleRow key={j} item={item} tiers={wholesale.tiers} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {wholesale && wholesale.lines.length > 0 && (
        <ul className="space-y-2 rounded-[24px] border border-line bg-surface p-4">
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

function WholesaleRow({ item, tiers }: { item: WholesaleItem; tiers: string[] }) {
  const priced = item.prices.some((p) => p !== null);
  return (
    <li className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        {item.image && <ProductPhoto src={item.image} alt={item.name} size={160} className="size-12 shrink-0 rounded-xl" />}
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{item.name}</p>
      </div>
      {priced ? (
        <dl className="mt-2.5 grid grid-cols-4 gap-1.5">
          {tiers.map((tier, i) => (
            <div key={tier} className={`rounded-xl px-1.5 py-1.5 text-center ${i === 0 ? "bg-surface-2" : "border border-line"}`}>
              <dt className="text-[11px] leading-tight text-muted">{tier}</dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums">
                {item.prices[i] != null ? formatPrice(item.prices[i]!).replace(" BYN", "") : "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-[13px] text-muted">Цена по запросу</p>
      )}
    </li>
  );
}

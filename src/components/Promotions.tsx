import { promoSections } from "@/config/promotions";

/** Вкладка «Акции и Доп»: карточки акций, сгруппированные по видам товаров. */
export function Promotions() {
  return (
    <div className="animate-fade-in space-y-6 pt-1">
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

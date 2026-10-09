"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { metroLines, pickupPoints } from "@/config/checkout";
import { siteConfig } from "@/config/site";
import {
  buildOrderMessage,
  emptyCheckoutForm,
  lineTotal,
  validateCheckout,
  type CartItem,
  type CartTotals,
  type CheckoutForm,
  type DeliveryMethod,
} from "@/lib/cart";
import { formatPrice, pluralize } from "@/lib/format";
import { telegramLink } from "@/lib/telegram";
import { ArrowLeftIcon, CartIcon, CheckIcon, CloseIcon, TelegramIcon, TrashIcon } from "../icons";
import { openTelegram } from "../TelegramAnchor";
import { useCart, useCartActions, useCartDrawer } from "./CartProvider";
import { ManagerHours } from "./ManagerHours";
import { QtyStepper } from "./QtyStepper";

type View = "cart" | "checkout" | "sent";

/** Корзина и оформление заказа в выезжающей панели (снизу на телефоне, справа на компьютере). */
export function CartDrawer() {
  const { open, setOpen } = useCartDrawer();
  // Форма живёт выше панели — введённое не теряется, если корзину закрыли и открыли снова.
  const [form, setForm] = useState<CheckoutForm>(emptyCheckoutForm);
  const close = useCallback(() => setOpen(false), [setOpen]);
  if (!open) return null;
  return <DrawerPanel onClose={close} form={form} setForm={setForm} />;
}

interface DrawerPanelProps {
  onClose: () => void;
  form: CheckoutForm;
  setForm: (form: CheckoutForm) => void;
}

function DrawerPanel({ onClose, form, setForm }: DrawerPanelProps) {
  const { items, totals } = useCart();
  const { clear } = useCartActions();
  const [view, setView] = useState<View>("cart");
  const [submitted, setSubmitted] = useState(false);
  const [sentText, setSentText] = useState("");
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Escape закрывает, страница под панелью не прокручивается.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const go = (next: View) => {
    setView(next);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const errors = validateCheckout(items, form);
  const valid = Object.keys(errors).length === 0;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const send = () => {
    setSubmitted(true);
    if (!valid) {
      bodyRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    const text = buildOrderMessage(items, form);
    setSentText(text);
    void copy(text); // запасной вариант: если Telegram не подставит текст — его можно вставить
    go("sent");
    openTelegram(telegramLink(text));
  };

  const finish = () => {
    clear();
    setForm(emptyCheckoutForm);
    onClose();
  };

  const title = view === "cart" ? "Корзина" : view === "checkout" ? "Оформление заказа" : "Заказ сформирован";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="animate-fade-in absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-sheet-in sm:animate-panel-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface outline-none sm:h-full sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-3xl"
      >
        {/* Шапка панели */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {view === "checkout" && (
            <IconButton label="Назад к корзине" onClick={() => go("cart")}>
              <ArrowLeftIcon />
            </IconButton>
          )}
          <h2 className="flex-1 text-lg font-extrabold tracking-tight">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {view === "cart" && <CartList items={items} onBrowse={onClose} />}
          {view === "checkout" && <CheckoutFields form={form} setForm={setForm} errors={submitted ? errors : {}} />}
          {view === "sent" && <SentView text={sentText} copied={copied} onCopy={() => copy(sentText)} />}
        </div>

        {/* Низ панели: итог и главная кнопка */}
        <div className="space-y-3 border-t border-line px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          {view !== "sent" && items.length > 0 && <TotalsRow totals={totals} />}
          {view === "cart" && items.length > 0 && (
            <PrimaryButton onClick={() => go("checkout")}>Оформить заказ</PrimaryButton>
          )}
          {view === "checkout" && (
            <>
              {submitted && errors.cart && <p className="text-sm font-semibold text-neon-pink">{errors.cart}</p>}
              <PrimaryButton onClick={send} disabled={items.length === 0}>
                <TelegramIcon />
                Отправить заказ
              </PrimaryButton>
            </>
          )}
          {view === "sent" && (
            <>
              <PrimaryButton onClick={() => openTelegram(telegramLink(sentText))}>
                <TelegramIcon />
                Открыть чат с менеджером
              </PrimaryButton>
              <button
                type="button"
                onClick={finish}
                className="h-12 w-full rounded-2xl border border-line bg-surface-2 text-sm font-semibold text-ink/85 transition active:scale-[0.98]"
              >
                Заказ отправлен — очистить корзину
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CartList({ items, onBrowse }: { items: CartItem[]; onBrowse: () => void }) {
  const { setQty, remove } = useCartActions();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <CartIcon width={44} height={44} className="text-muted" />
        <p className="text-lg font-bold">Корзина пуста</p>
        <p className="max-w-64 text-sm text-muted">Добавьте товары кнопкой «В корзину» на карточках каталога.</p>
        <button
          type="button"
          onClick={onBrowse}
          className="mt-2 h-11 rounded-2xl border border-line bg-surface-2 px-5 text-sm font-semibold transition active:scale-[0.97]"
        >
          Перейти в каталог
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2.5">
        {items.map((item) => {
          const total = lineTotal(item);
          return (
            <li key={item.id} className="rounded-2xl border border-line bg-surface-2/70 p-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[15px] font-semibold leading-snug text-ink">{item.title}</p>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={`Удалить: ${item.title}`}
                  className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-muted transition active:scale-90 active:bg-white/10"
                >
                  <TrashIcon width={17} height={17} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <QtyStepper
                  size="sm"
                  qty={item.qty}
                  label={item.title}
                  onChange={(qty) => setQty(item, qty)}
                  className="w-32"
                />
                <div className="text-right">
                  <p className="text-base font-black tabular-nums">
                    {total === null ? "Цена по запросу" : formatPrice(total)}
                  </p>
                  {item.price !== null && item.qty > 1 && (
                    <p className="text-xs text-muted tabular-nums">
                      {formatPrice(item.price)} × {item.qty}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <ManagerHours />
    </div>
  );
}

const METHODS: { id: DeliveryMethod; title: string; icon: string; hint: string }[] = [
  { id: "metro", title: "Метро", icon: "🚇", hint: "Встреча в Минске" },
  { id: "pickup", title: "Самовывоз", icon: "🏪", hint: "Из точки" },
  { id: "delivery", title: "Доставка", icon: "🏠", hint: "На дом" },
];

interface CheckoutFieldsProps {
  form: CheckoutForm;
  setForm: (form: CheckoutForm) => void;
  errors: ReturnType<typeof validateCheckout>;
}

function CheckoutFields({ form, setForm, errors }: CheckoutFieldsProps) {
  const set = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => setForm({ ...form, [key]: value });

  return (
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()} noValidate>
      <ManagerHours />

      <fieldset className="space-y-2.5">
        <legend className="mb-2.5 text-sm font-bold text-ink/90">Способ получения</legend>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((method) => {
            const selected = form.method === method.id;
            return (
              <label
                key={method.id}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition active:scale-[0.97] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neon-violet/60 ${
                  selected ? "border-neon-violet/70 bg-neon-violet/15" : "border-line bg-surface-2/70"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={method.id}
                  checked={selected}
                  onChange={() => set("method", method.id)}
                  className="sr-only"
                />
                <span className="text-2xl" aria-hidden>
                  {method.icon}
                </span>
                <span className="text-sm font-bold text-ink">{method.title}</span>
                <span className="text-[11px] leading-tight text-muted">{method.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {form.method === "metro" && (
        <Field label="Станция метро (Минск)" error={errors.station} id="station">
          <Select id="station" value={form.station} onChange={(v) => set("station", v)} invalid={!!errors.station}>
            <option value="">Выберите станцию</option>
            {metroLines.map((line) => (
              <optgroup key={line.id} label={line.title}>
                {line.stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}

      {form.method === "pickup" && (
        <Field label="Точка самовывоза" error={errors.pickupPoint} id="pickup">
          <Select
            id="pickup"
            value={form.pickupPoint}
            onChange={(v) => set("pickupPoint", v)}
            invalid={!!errors.pickupPoint}
          >
            <option value="">Выберите точку</option>
            {pickupPoints.map((point) => (
              <option key={point} value={point}>
                {point}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {form.method === "delivery" && (
        <div className="space-y-4">
          <p className="rounded-2xl border border-neon-pink/40 bg-neon-pink/10 px-3.5 py-3 text-sm font-semibold leading-snug text-neon-pink">
            ⚠️ Внимание! За доставку на дом взимается дополнительная плата.
          </p>
          <Field label="Адрес доставки" error={errors.address} id="address">
            <input
              id="address"
              type="text"
              autoComplete="street-address"
              placeholder="Улица, дом, квартира"
              value={form.address}
              onChange={(event) => set("address", event.target.value)}
              aria-invalid={!!errors.address}
              className={inputClass(!!errors.address)}
            />
          </Field>
          <Field label="Номер телефона" error={errors.phone} id="phone">
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+375 29 123-45-67"
              value={form.phone}
              onChange={(event) => set("phone", event.target.value)}
              aria-invalid={!!errors.phone}
              className={inputClass(!!errors.phone)}
            />
          </Field>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Заказ откроется в Telegram в чате с @{siteConfig.telegramManager} — останется нажать «Отправить». Текст заказа
        также копируется в буфер обмена.
      </p>
    </form>
  );
}

function SentView({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-neon-green/30 bg-neon-green/10 px-3.5 py-3">
        <CheckIcon className="shrink-0 text-neon-green" />
        <p className="text-sm leading-snug text-ink">
          Открываем чат с менеджером. Если текст заказа не подставился сам — вставьте его в чат
          {copied ? " (он уже скопирован)" : ""} и отправьте.
        </p>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-2xl border border-line bg-surface-2/70 p-3.5 font-sans text-sm leading-relaxed text-ink/90">
        {text}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="h-11 w-full rounded-2xl border border-line bg-surface-2 text-sm font-semibold transition active:scale-[0.98]"
      >
        {copied ? "✓ Скопировано" : "Скопировать текст заказа"}
      </button>
      <ManagerHours />
    </div>
  );
}

function TotalsRow({ totals }: { totals: CartTotals }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-sm text-muted">
        {totals.count} {pluralize(totals.count, ["товар", "товара", "товаров"])}
      </p>
      <p className="text-right">
        <span className="text-sm text-muted">Итого: </span>
        <span className="text-2xl font-black tabular-nums tracking-tight">{formatPrice(totals.sum)}</span>
        {totals.hasUnpriced && <span className="block text-xs text-amber">+ позиции с ценой по запросу</span>}
      </p>
    </div>
  );
}

function PrimaryButton({ children, ...props }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className="neon-button flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-xl text-ink/80 transition active:scale-90 active:bg-white/10"
    >
      {children}
    </button>
  );
}

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-ink/90">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs font-semibold text-neon-pink">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  `h-12 w-full rounded-2xl border bg-surface-2/90 px-4 text-base text-ink outline-none transition placeholder:text-muted/70 focus:border-neon-violet/60 focus:shadow-[0_0_0_4px] focus:shadow-neon-violet/15 ${
    invalid ? "border-neon-pink/70" : "border-line"
  }`;

interface SelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  children: ReactNode;
}

function Select({ id, value, onChange, invalid, children }: SelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={`${inputClass(invalid)} appearance-none pr-10 [&_option]:text-ink ${value ? "" : "text-muted"}`}
      >
        {children}
      </select>
      <svg
        aria-hidden
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

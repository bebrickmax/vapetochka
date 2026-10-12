"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { metroLines, pickupPoints } from "@/config/checkout";
import { siteConfig } from "@/config/site";
import type { StoreInfo } from "@/config/stores";
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
import { copyText, openTelegram } from "../TelegramAnchor";
import { useCart, useCartActions, useCartDrawer } from "./CartProvider";
import { ManagerHours } from "./ManagerHours";
import { QtyStepper } from "./QtyStepper";

type View = "cart" | "checkout" | "sent";

/** Корзина и оформление заказа в выезжающей панели (снизу на телефоне, справа на компьютере). */
export function CartDrawer({ store }: { store: StoreInfo }) {
  const { open, setOpen } = useCartDrawer();
  // Форма живёт выше панели — введённое не теряется, если корзину закрыли и открыли снова.
  const [form, setForm] = useState<CheckoutForm>(emptyCheckoutForm);
  const close = useCallback(() => setOpen(false), [setOpen]);
  if (!open) return null;
  return <DrawerPanel onClose={close} form={form} setForm={setForm} store={store} />;
}

interface DrawerPanelProps {
  store: StoreInfo;
  onClose: () => void;
  form: CheckoutForm;
  setForm: (form: CheckoutForm) => void;
}

function DrawerPanel({ store, onClose, form: rawForm, setForm }: DrawerPanelProps) {
  // В точке «только самовывоз» способ получения фиксированный.
  const form: CheckoutForm =
    store.checkout.kind === "pickup-only"
      ? { ...rawForm, method: "pickup", pickupPoint: store.checkout.point }
      : rawForm;
  const { items, totals } = useCart();
  const { clear } = useCartActions();
  const [view, setView] = useState<View>("cart");
  const [submitted, setSubmitted] = useState(false);
  const [sentText, setSentText] = useState("");
  const [copied, setCopied] = useState(false);
  /** На компьютере чат открывается без текста — его нужно вставить. */
  const [needsPaste, setNeedsPaste] = useState(false);
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

  const copy = async (text: string) => setCopied(await copyText(text));

  const send = () => {
    setSubmitted(true);
    if (!valid) {
      bodyRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    const text = buildOrderMessage(items, form, store.title);
    setSentText(text);
    void copy(text); // запасной вариант: если Telegram не подставит текст — его можно вставить
    go("sent");
    setNeedsPaste(openTelegram(telegramLink(text), { silent: true }));
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
        className="animate-sheet-in sm:animate-panel-in relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-line bg-raised outline-none sm:h-full sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-[28px]"
      >
        {/* Шапка панели */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {view === "checkout" && (
            <IconButton label="Назад к корзине" onClick={() => go("cart")}>
              <ArrowLeftIcon />
            </IconButton>
          )}
          <h2 className="font-wide flex-1 text-lg font-semibold">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {view === "cart" && <CartList items={items} onBrowse={onClose} />}
          {view === "checkout" && (
            <CheckoutFields store={store} form={form} setForm={setForm} errors={submitted ? errors : {}} />
          )}
          {view === "sent" && (
            <SentView text={sentText} copied={copied} needsPaste={needsPaste} onCopy={() => copy(sentText)} />
          )}
        </div>

        {/* Низ панели: итог и главная кнопка */}
        <div className="space-y-3 border-t border-line px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          {view !== "sent" && items.length > 0 && <TotalsRow totals={totals} />}
          {view === "cart" && items.length > 0 && (
            <PrimaryButton onClick={() => go("checkout")}>Оформить заказ</PrimaryButton>
          )}
          {view === "checkout" && (
            <>
              {submitted && errors.cart && <p className="text-sm font-semibold text-danger">{errors.cart}</p>}
              <PrimaryButton onClick={send} disabled={items.length === 0}>
                <TelegramIcon />
                Отправить заказ
              </PrimaryButton>
            </>
          )}
          {view === "sent" && (
            <>
              <PrimaryButton onClick={() => setNeedsPaste(openTelegram(telegramLink(sentText), { silent: true }))}>
                <TelegramIcon />
                Открыть чат с менеджером
              </PrimaryButton>
              <button
                type="button"
                onClick={finish}
                className="h-12 w-full rounded-full border border-line-strong text-sm font-semibold text-ink/85 transition active:scale-[0.98]"
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
          className="mt-2 h-11 rounded-full border border-line-strong px-5 text-sm font-semibold transition active:scale-[0.97]"
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
            <li key={item.id} className="rounded-2xl border border-line bg-surface p-3">
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
                  <p className="font-wide text-[15px] font-semibold tabular-nums">
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
  store: StoreInfo;
  form: CheckoutForm;
  setForm: (form: CheckoutForm) => void;
  errors: ReturnType<typeof validateCheckout>;
}

function CheckoutFields({ store, form, setForm, errors }: CheckoutFieldsProps) {
  const set = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => setForm({ ...form, [key]: value });

  if (store.checkout.kind === "pickup-only") {
    return (
      <form className="space-y-5" onSubmit={(event) => event.preventDefault()} noValidate>
        <ManagerHours />
        <div className="rounded-2xl border border-line-strong p-4">
          <p className="text-sm text-muted">Способ получения</p>
          <p className="font-wide mt-1 text-[17px] font-semibold">Самовывоз: {store.checkout.point}</p>
          <p className="mt-1.5 text-sm leading-snug text-muted">
            Заказ соберём из наличия этой точки. Время, когда можно забрать, подскажет менеджер.
          </p>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Заказ откроется в Telegram в чате с @{siteConfig.telegramManager} — останется нажать «Отправить». Текст заказа
          также копируется в буфер обмена.
        </p>
      </form>
    );
  }

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
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition active:scale-[0.97] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-paper ${
                  selected ? "btn-paper border-paper" : "border-line bg-surface"
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
                <span className="text-sm font-bold">{method.title}</span>
                <span className={`text-[11px] leading-tight ${selected ? "text-black/55" : "text-muted"}`}>
                  {method.hint}
                </span>
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
          <p className="rounded-2xl border border-line-strong px-3.5 py-3 text-sm font-semibold leading-snug text-ink">
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

interface SentViewProps {
  text: string;
  copied: boolean;
  needsPaste: boolean;
  onCopy: () => void;
}

function SentView({ text, copied, needsPaste, onCopy }: SentViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-line-strong px-3.5 py-3">
        <CheckIcon className="shrink-0 text-ink" />
        <p className="text-sm leading-snug text-ink">
          {needsPaste
            ? `Открываем чат с менеджером. ${copied ? "Текст заказа уже скопирован — вставьте" : "Скопируйте текст заказа и вставьте"} его в поле сообщения (⌘V или Ctrl+V) и отправьте.`
            : `Открываем чат с менеджером. Если текст заказа не подставился сам — вставьте его в чат${copied ? " (он уже скопирован)" : ""} и отправьте.`}
        </p>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-2xl border border-line bg-surface p-3.5 font-sans text-sm leading-relaxed text-ink/90">
        {text}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="h-11 w-full rounded-full border border-line-strong text-sm font-semibold transition active:scale-[0.98]"
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
        <span className="font-wide text-[22px] font-semibold tabular-nums">{formatPrice(totals.sum)}</span>
        {totals.hasUnpriced && <span className="block text-xs text-muted">+ позиции с ценой по запросу</span>}
      </p>
    </div>
  );
}

function PrimaryButton({ children, ...props }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className="btn-paper flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
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
      className="flex size-10 items-center justify-center rounded-full text-ink/80 transition active:scale-90 active:bg-white/10"
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
        <p id={`${id}-error`} className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  `h-12 w-full rounded-2xl border bg-surface px-4 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink ${
    invalid ? "border-danger" : "border-line"
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

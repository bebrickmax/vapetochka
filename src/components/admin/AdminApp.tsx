"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { DbLine, DbStock } from "@/lib/db/types";
import { pluralize } from "@/lib/format";
import { sizedPhoto } from "@/lib/photos";
import { CloseIcon, PlusIcon, SearchIcon } from "../icons";
import { LogoMark } from "../Logo";
import { AddSheet } from "./AddSheet";
import { api, UnauthorizedError } from "./api";
import { ItemSheet, LineSheet, type AdminActions } from "./EditSheets";
import { ImportSheet } from "./ImportSheet";
import {
  brandsOf,
  buildView,
  formatPrice,
  patchItem,
  patchLine,
  patchStock,
  removeItem,
  removeLine,
  sortItems,
  type AdminData,
  type Filters,
  type ItemView,
  type LineView,
} from "./model";
import { inputClass, PrimaryButton, Toggle } from "./ui";

type Session = { authorized: boolean; adminConfigured: boolean; dbConfigured: boolean };

const STORE_KEY = "vt:admin-store";

// ─── Корень: вход → загрузка данных → каталог ───────────────────────────────

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await api<Session>("/api/admin/session"));
    } catch {
      setSession({ authorized: false, adminConfigured: true, dbConfigured: true });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- проверка входа при открытии
    void refreshSession();
  }, [refreshSession]);

  if (!session) return <Splash text="Загрузка…" />;
  if (!session.adminConfigured)
    return (
      <Notice title="Админка не настроена">
        Добавьте в Vercel переменную <b>ADMIN_PASSWORD</b> (пароль для входа) и сделайте Redeploy.
      </Notice>
    );
  if (!session.authorized) return <Login onLoggedIn={refreshSession} />;
  if (!session.dbConfigured)
    return (
      <Notice title="База данных не подключена">
        Создайте проект в Supabase, выполните <b>supabase/schema.sql</b> и добавьте в Vercel переменные{" "}
        <b>SUPABASE_URL</b> и <b>SUPABASE_SERVICE_ROLE_KEY</b>. Подробно — в ADMIN.md в репозитории.
      </Notice>
    );
  return <Panel onLoggedOut={refreshSession} />;
}

function Splash({ text }: { text: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 text-muted">
      <LogoMark className="h-14 w-auto animate-shimmer text-ink" />
      <p className="text-sm">{text}</p>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <LogoMark className="h-12 w-auto self-start text-ink" />
      <h1 className="font-wide text-2xl font-semibold">{title}</h1>
      <p className="text-[15px] leading-relaxed text-ink/80">{children}</p>
    </main>
  );
}

function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/session", { body: { password } });
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <LogoMark className="mb-6 h-14 w-auto self-start text-ink" />
      <h1 className="font-wide text-2xl font-semibold">Админка</h1>
      <p className="mt-1 text-sm text-muted">Наличие и цены Vape Точки</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          inputMode="text"
          autoFocus
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          aria-label="Пароль"
        />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <PrimaryButton type="submit" disabled={busy || !password}>
          {busy ? "Вхожу…" : "Войти"}
        </PrimaryButton>
      </form>
    </main>
  );
}

// ─── Панель ─────────────────────────────────────────────────────────────────

type Open =
  | { kind: "add"; line?: DbLine }
  | { kind: "line"; lineId: string }
  | { kind: "item"; itemId: string }
  | { kind: "import" }
  | null;

function Panel({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [filters, setFilters] = useState<Filters>({ storeId: "main", query: "", categoryId: "", brand: "", status: "all" });
  const deferredQuery = useDeferredValue(filters.query);
  const dataRef = useRef<AdminData | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), error ? 5000 : 2200);
  }, []);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) return onLoggedOut();
      notify(e instanceof Error ? e.message : "Не удалось сохранить", true);
    },
    [notify, onLoggedOut],
  );

  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>("/api/admin/catalog"));
      setLoadError("");
    } catch (e) {
      if (e instanceof UnauthorizedError) return onLoggedOut();
      setLoadError(e instanceof Error ? e.message : "Не удалось загрузить каталог");
    }
  }, [onLoggedOut]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- точка запоминается в браузере
      if (saved) setFilters((f) => ({ ...f, storeId: saved }));
    } catch {
      /* ignore */
    }
    void load();
  }, [load]);

  /** Оптимистично: сразу меняем экран, затем сохраняем; при ошибке — откат. */
  const optimistic = useCallback(
    async (apply: (d: AdminData) => AdminData, request: () => Promise<unknown>, done?: string) => {
      const before = dataRef.current;
      if (!before) return false;
      const next = apply(before);
      dataRef.current = next; // следующее быстрое нажатие видит уже обновлённые данные
      setData(next);
      try {
        await request();
        if (done) notify(done);
        return true;
      } catch (e) {
        dataRef.current = before;
        setData(before);
        handleError(e);
        return false;
      }
    },
    [notify, handleError],
  );

  const storeId = filters.storeId;
  const actions = useMemo<AdminActions>(
    () => ({
      setStock: (itemIds, patch) =>
        optimistic(
          (d) =>
            patchStock(d, storeId, itemIds, {
              ...(patch.inStock !== undefined && { in_stock: patch.inStock }),
              ...(patch.price !== undefined && { price: patch.price }),
            }),
          () => api("/api/admin/stock", { method: "PATCH", body: { updates: itemIds.map((itemId) => ({ itemId, storeId, ...patch })) } }),
          itemIds.length > 1 ? `Готово: ${itemIds.length} ${pluralize(itemIds.length, ["позиция", "позиции", "позиций"])}` : undefined,
        ),
      updateItem: (id, patch) =>
        optimistic(
          (d) => {
            let next = patchItem(d, id, {
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.variant !== undefined && { variant: patch.variant }),
              ...(patch.imageUrl !== undefined && { image_url: patch.imageUrl }),
            });
            if (patch.title !== undefined || patch.variant !== undefined) {
              const lineId = next.items.find((i) => i.id === id)?.line_id;
              if (lineId) next = sortItems(next, [lineId]);
            }
            if (patch.stores) {
              const current = next.stock.filter((s) => s.item_id === id);
              const template = current[0];
              next = {
                ...next,
                stock: [
                  ...next.stock.filter((s) => s.item_id !== id || patch.stores!.includes(s.store_id)),
                  ...patch.stores
                    .filter((s) => !current.some((c) => c.store_id === s))
                    .map<DbStock>((s) => ({ item_id: id, store_id: s, price: template?.price ?? null, old_price: null, in_stock: true })),
                ],
              };
            }
            return next;
          },
          () => api(`/api/admin/items/${id}`, { method: "PATCH", body: patch }),
          "Сохранено",
        ),
      deleteItem: (id) => optimistic((d) => removeItem(d, id), () => api(`/api/admin/items/${id}`, { method: "DELETE" }), "Удалено"),
      updateLine: (id, patch) =>
        optimistic(
          (d) =>
            patchLine(d, id, {
              ...(patch.name !== undefined && { name: patch.name }),
              ...(patch.brand !== undefined && { brand: patch.brand }),
              ...(patch.note !== undefined && { note: patch.note }),
              ...(patch.categoryId !== undefined && { category_id: patch.categoryId }),
              ...(patch.imageUrl !== undefined && { image_url: patch.imageUrl }),
            }),
          () => api(`/api/admin/lines/${id}`, { method: "PATCH", body: patch }),
          "Сохранено",
        ),
      deleteLine: (id) => optimistic((d) => removeLine(d, id), () => api(`/api/admin/lines/${id}`, { method: "DELETE" }), "Линейка удалена"),
      sortLines: (lineIds) =>
        optimistic(
          (d) => sortItems(d, lineIds),
          () => api("/api/admin/sort", { body: lineIds?.length === 1 ? { lineId: lineIds[0] } : {} }),
          "Вкусы расставлены по алфавиту",
        ),
    }),
    [optimistic, storeId],
  );

  const view = useMemo(
    () => (data ? buildView(data, { ...filters, query: deferredQuery }) : []),
    [data, filters, deferredQuery],
  );

  if (loadError && !data)
    return (
      <Notice title="Не удалось загрузить каталог">
        {loadError}{" "}
        <button type="button" onClick={load} className="font-bold underline">
          Повторить
        </button>
      </Notice>
    );
  if (!data) return <Splash text="Загружаю каталог…" />;

  const store = data.stores.find((s) => s.id === storeId) ?? data.stores[0];
  const visibleItems = view.flatMap((v) => v.visible);
  const expandAll = deferredQuery.trim().length > 0 || filters.status !== "all" || !!filters.brand;
  const empty = data.lines.length === 0;

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value, ...(key === "categoryId" && { brand: "" }) }));
    if (key === "storeId") {
      try {
        window.localStorage.setItem(STORE_KEY, String(value));
      } catch {
        /* ignore */
      }
    }
  };

  const bulk = (inStock: boolean) => {
    const ids = visibleItems.map((v) => v.item.id);
    if (ids.length === 0) return;
    const what = inStock ? "«в наличии»" : "«нет в наличии»";
    if (!window.confirm(`Отметить ${ids.length} ${pluralize(ids.length, ["показанную позицию", "показанные позиции", "показанных позиций"])} как ${what} в точке «${store.title}»?`)) return;
    void actions.setStock(ids, { inStock });
  };

  const openLine = open?.kind === "line" ? view.find((v) => v.line.id === open.lineId) : undefined;
  const openItem = open?.kind === "item" ? data.items.find((i) => i.id === open.itemId) : undefined;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-28">
      {/* Шапка */}
      <div className="sticky top-0 z-30 space-y-3 border-b border-line bg-bg/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <LogoMark className="h-7 w-auto shrink-0" />
          <div role="tablist" aria-label="Точка" className="grid flex-1 grid-cols-2 gap-1 rounded-full border border-line p-1">
            {data.stores.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === storeId}
                onClick={() => setFilter("storeId", s.id)}
                className={`h-9 truncate rounded-full px-2 text-[13px] font-bold transition ${
                  s.id === storeId ? "btn-paper" : "text-ink/75"
                }`}
              >
                {s.short ?? s.title}
              </button>
            ))}
          </div>
          <Menu
            onImport={() => setOpen({ kind: "import" })}
            onSortAll={() => {
              if (window.confirm("Расставить вкусы по алфавиту во всех линейках? Порядок на сайте тоже поменяется.")) void actions.sortLines();
            }}
            onLogout={async () => { await api("/api/admin/session", { method: "DELETE" }); onLoggedOut(); }} />
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            enterKeyHint="search"
            value={filters.query}
            onChange={(e) => setFilter("query", e.target.value)}
            placeholder="Бренд, линейка или вкус"
            aria-label="Поиск"
            className="h-12 w-full rounded-full border border-line bg-surface pl-12 pr-11 text-base outline-none focus:border-ink"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => setFilter("query", "")}
              aria-label="Очистить поиск"
              className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted"
            >
              <CloseIcon width={18} height={18} />
            </button>
          )}
        </div>

        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {[{ id: "", title: "Все" }, ...data.categories].map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              onClick={() => setFilter("categoryId", c.id)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition ${
                filters.categoryId === c.id ? "btn-paper" : "border border-line text-ink/80"
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <select
            value={filters.brand}
            onChange={(e) => setFilter("brand", e.target.value)}
            aria-label="Бренд"
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-sm outline-none"
          >
            <option value="">Все бренды</option>
            {brandsOf(data, filters.categoryId).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
            aria-label="Наличие"
            className="h-10 rounded-full border border-line bg-surface px-3 text-sm outline-none"
          >
            <option value="all">Любое наличие</option>
            <option value="in">В наличии</option>
            <option value="out">Нет в наличии</option>
          </select>
        </div>
      </div>

      {/* Сводка и массовые действия по показанным позициям */}
      {!empty && (
        <div className="flex items-center gap-2 px-4 py-3">
          <p className="flex-1 text-sm text-muted">
            <b className="text-ink">{visibleItems.length}</b> поз. · {view.length} лин.
          </p>
          <button type="button" onClick={() => bulk(true)} className="h-9 rounded-full border border-line-strong px-3 text-[13px] font-bold active:scale-95">
            Все ✓
          </button>
          <button type="button" onClick={() => bulk(false)} className="h-9 rounded-full border border-line-strong px-3 text-[13px] font-bold active:scale-95">
            Все ✕
          </button>
        </div>
      )}

      {empty ? (
        <div className="mx-4 mt-6 space-y-4 rounded-[26px] border border-dashed border-line-strong p-6 text-center">
          <p className="font-wide text-lg font-semibold">База пока пустая</p>
          <p className="text-sm text-muted">Перенесите ассортимент из Google Таблиц одной кнопкой — линейки, вкусы, цены, наличие и фото.</p>
          <PrimaryButton onClick={() => setOpen({ kind: "import" })}>Импортировать из таблиц</PrimaryButton>
        </div>
      ) : view.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">Ничего не найдено. Измените поиск или фильтры.</p>
      ) : (
        <ul className="space-y-2.5 px-4">
          {view.map((v) => (
            <LineBlock
              key={v.line.id}
              view={v}
              forceOpen={expandAll}
              actions={actions}
              onEditLine={() => setOpen({ kind: "line", lineId: v.line.id })}
              onEditItem={(id) => setOpen({ kind: "item", itemId: id })}
              onAddItem={() => setOpen({ kind: "add", line: v.line })}
            />
          ))}
        </ul>
      )}

      {/* Добавить */}
      <button
        type="button"
        onClick={() => setOpen({ kind: "add" })}
        aria-label="Добавить товар"
        className="btn-paper fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-4 z-40 flex size-16 items-center justify-center rounded-full shadow-[0_12px_40px_-8px_rgb(0_0_0/0.9)] active:scale-95"
      >
        <PlusIcon width={28} height={28} />
      </button>

      {toast && (
        <div
          role="status"
          className={`animate-pop-in fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),1.25rem)+5rem)] z-[60] mx-auto max-w-sm rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-lg ${
            toast.error ? "border-danger/60 bg-raised text-danger" : "border-line-strong bg-raised text-ink"
          }`}
        >
          {toast.text}
        </div>
      )}

      {open?.kind === "add" && (
        <AddSheet
          data={data}
          storeId={storeId}
          presetLine={open.line}
          onClose={() => setOpen(null)}
          onCreated={({ line, items, stores, price, inStock }) => {
            setData((d) =>
              d &&
              sortItems(
                {
                  ...d,
                  lines: d.lines.some((l) => l.id === line.id) ? d.lines : [...d.lines, line],
                  items: [...d.items, ...items],
                  stock: [
                    ...d.stock,
                    ...items.flatMap((i) => stores.map<DbStock>((s) => ({ item_id: i.id, store_id: s, price, old_price: null, in_stock: inStock }))),
                  ],
                },
                [line.id],
              ),
            );
            setOpen(null);
            notify(`Добавлено: ${items.length} ${pluralize(items.length, ["позиция", "позиции", "позиций"])}`);
          }}
        />
      )}
      {openLine && <LineSheet view={openLine} data={data} storeTitle={store.title} actions={actions} onClose={() => setOpen(null)} />}
      {openItem && <ItemSheet item={openItem} data={data} actions={actions} onClose={() => setOpen(null)} />}
      {open?.kind === "import" && <ImportSheet data={data} onClose={() => setOpen(null)} onDone={load} />}
    </div>
  );
}

function Menu({ onImport, onSortAll, onLogout }: { onImport: () => void; onSortAll: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Меню"
        aria-expanded={open}
        className="flex size-11 items-center justify-center rounded-full border border-line-strong text-lg font-bold"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-line bg-raised shadow-xl">
            <button type="button" onClick={() => { setOpen(false); onImport(); }} className="block w-full px-4 py-3 text-left text-sm font-semibold active:bg-white/10">
              Импорт из таблиц
            </button>
            <button type="button" onClick={() => { setOpen(false); onSortAll(); }} className="block w-full border-t border-line px-4 py-3 text-left text-sm font-semibold active:bg-white/10">
              Все вкусы по алфавиту
            </button>
            <a href="/" target="_blank" rel="noopener" className="block border-t border-line px-4 py-3 text-sm font-semibold active:bg-white/10">
              Открыть сайт
            </a>
            <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="block w-full border-t border-line px-4 py-3 text-left text-sm font-semibold text-danger active:bg-white/10">
              Выйти
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Линейка и позиции ──────────────────────────────────────────────────────

function LineBlock({
  view,
  forceOpen,
  actions,
  onEditLine,
  onEditItem,
  onAddItem,
}: {
  view: LineView;
  forceOpen: boolean;
  actions: AdminActions;
  onEditLine: () => void;
  onEditItem: (id: string) => void;
  onAddItem: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const open = opened || forceOpen;
  const { line, category } = view;
  const image = line.image_url ?? view.all.find((v) => v.item.image_url)?.item.image_url;

  return (
    <li className="overflow-hidden rounded-[22px] border border-line bg-surface">
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={() => setOpened((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-paper">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- фото из хранилища
              <img src={sizedPhoto(image, 160)} alt="" loading="lazy" className="size-full object-contain p-0.5" />
            ) : (
              <LogoMark className="h-5 w-auto text-black/20" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-muted">
              {[category?.title, line.brand, line.section].filter(Boolean).join(" · ")}
            </span>
            <span className="font-wide block text-[15px] font-semibold leading-tight [overflow-wrap:anywhere]">{line.name}</span>
            <span className="mt-0.5 block text-[12px] text-muted">
              {view.inStock}/{view.all.length} в наличии · {formatPrice(view.price)}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onEditLine}
          aria-label={`Изменить линейку ${line.name}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-lg font-bold"
        >
          ⋯
        </button>
      </div>

      {open && (
        <div className="border-t border-line">
          <ul>
            {view.visible.map((v) => (
              <ItemRow key={v.item.id} view={v} linePrice={view.price} actions={actions} onEdit={() => onEditItem(v.item.id)} />
            ))}
          </ul>
          <button type="button" onClick={onAddItem} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-bold text-ink/85 active:bg-white/5">
            <PlusIcon width={16} height={16} /> Добавить вкус
          </button>
        </div>
      )}
    </li>
  );
}

function ItemRow({ view, linePrice, actions, onEdit }: { view: ItemView; linePrice: number | null; actions: AdminActions; onEdit: () => void }) {
  const { item, stock, price } = view;
  return (
    <li className="flex items-center gap-2 border-t border-line py-1 pl-3 pr-1 first:border-t-0">
      <div className={`min-w-0 flex-1 py-1.5 ${stock.in_stock ? "" : "opacity-50"}`}>
        <InlineText
          value={item.title}
          label="Название"
          onSave={(title) => actions.updateItem(item.id, { title })}
          className="block w-full text-left text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]"
        />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          {item.variant && <span>{item.variant}</span>}
          <InlinePrice value={price} highlight={price !== linePrice} onSave={(p) => actions.setStock([item.id], { price: p })} />
        </div>
      </div>
      <button type="button" onClick={onEdit} aria-label={`Ещё: ${item.title}`} className="flex size-10 shrink-0 items-center justify-center text-lg font-bold text-muted">
        ⋯
      </button>
      <Toggle
        checked={stock.in_stock}
        onChange={(inStock) => void actions.setStock([item.id], { inStock })}
        label={`В наличии: ${item.title}`}
      />
    </li>
  );
}

/** Текст, который правится прямо в строке: нажали — поле ввода, Enter или уход — сохранить. */
function InlineText({ value, onSave, label, className }: { value: string; onSave: (v: string) => void; label: string; className: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing)
    return (
      <button type="button" onClick={() => { setDraft(value); setEditing(true); }} className={className} aria-label={`${label}: ${value}. Изменить`}>
        {value}
      </button>
    );
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={label}
      className="h-10 w-full rounded-xl border border-ink bg-bg px-3 text-[15px] outline-none"
    />
  );
}

function InlinePrice({ value, highlight, onSave }: { value: number | null; highlight: boolean; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => { setDraft(value === null ? "" : String(value)); setEditing(true); }}
        className={`rounded-md py-0.5 font-semibold underline decoration-dotted underline-offset-2 ${highlight ? "text-ink" : ""}`}
        aria-label={`Цена ${formatPrice(value)}. Изменить`}
      >
        {formatPrice(value)}
      </button>
    );
  const commit = () => {
    setEditing(false);
    const next = draft.trim() === "" ? null : Number(draft.replace(",", "."));
    if (next !== null && (!Number.isFinite(next) || next < 0)) return;
    if (next !== value) onSave(next);
  };
  return (
    <input
      autoFocus
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label="Цена, BYN"
      className="h-9 w-24 rounded-lg border border-ink bg-bg px-2 text-sm text-ink outline-none"
    />
  );
}


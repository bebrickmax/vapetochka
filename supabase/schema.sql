-- ════════════════════════════════════════════════════════════════════════════
--  Vape Точка — схема каталога (Supabase / PostgreSQL)
--  Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.
--  Повторный запуск безопасен (IF NOT EXISTS / ON CONFLICT).
-- ════════════════════════════════════════════════════════════════════════════

-- Категории = вкладки витрины (Жидкости, Одноразки, Расходники…).
create table if not exists categories (
  id         text primary key,              -- 'liquids', 'disposables'…
  title      text not null,                 -- 'Жидкости'
  sort       integer not null default 0
);

-- Линейка: «Skala 20mg», «Elfbar BC4000 5%», «Smoant (испарители)».
create table if not exists product_lines (
  id          uuid primary key default gen_random_uuid(),
  category_id text not null references categories(id) on update cascade on delete restrict,
  brand       text,                         -- 'Tasty Lab', 'Duall' — для фильтра брендов
  section     text,                         -- подраздел листа: 'Картриджи', 'Испарители'
  name        text not null,                -- 'Рик и Морти на замерзоне 50mg' (крепость берётся из названия)
  note        text,                         -- пояснение: 'Цена за пару'
  image_url   text,                         -- обложка линейки
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists product_lines_category_idx on product_lines (category_id, sort);

-- Позиция внутри линейки: вкус, цвет, модель испарителя.
create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references product_lines(id) on delete cascade,
  title       text not null,                -- '🍍❄️Ананас со льдом - Описание' (эмодзи и описание как в таблице)
  variant     text,                         -- '0.6 Ом'
  image_url   text,                         -- своё фото (у испарителей/картриджей)
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists items_line_idx on items (line_id, sort);

-- Наличие и цена позиции в конкретной точке. Нет строки — позиции нет в этой точке.
create table if not exists item_stock (
  item_id     uuid not null references items(id) on delete cascade,
  store_id    text not null check (store_id in ('main', 'kamennaya-gorka')),
  price       numeric(10, 2),               -- BYN; null — «цена по запросу»
  old_price   numeric(10, 2),               -- зачёркнутая цена (скидка)
  in_stock    boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (item_id, store_id)
);
create index if not exists item_stock_store_idx on item_stock (store_id);

-- Откуда точка берёт товары: 'sheet' — из Google Таблицы (админка правит наличие и цены поверх неё),
-- 'db' — только из базы (всё меняется в админке). Нет строки — 'sheet'.
create table if not exists store_settings (
  store_id    text primary key check (store_id in ('main', 'kamennaya-gorka')),
  source      text not null default 'sheet' check (source in ('sheet', 'db')),
  updated_at  timestamptz not null default now()
);

-- Быстрые правки из админки поверх Google Таблицы (режим 'sheet').
-- Правка действует, пока в таблице не поменяли ту же клетку: рядом хранится значение таблицы
-- на момент правки — если оно стало другим, побеждает таблица, а правка удаляется.
create table if not exists sheet_overrides (
  store_id      text not null check (store_id in ('main', 'kamennaya-gorka')),
  product_id    text not null,            -- id товара на витрине (по названию линейки и вкуса)
  in_stock      boolean,                  -- null — наличие как в таблице
  sheet_status  text,                     -- наличие в таблице в момент правки: in / out / unknown
  price_set     boolean not null default false,
  price         numeric(10, 2),
  sheet_price   numeric(10, 2),           -- цена в таблице в момент правки
  updated_at    timestamptz not null default now(),
  primary key (store_id, product_id)
);

-- Зеркало Google Таблицы (точка «от таблицы»): база синхронизируется с таблицей, админка дописывает своё.
--   sheet_key у линеек и позиций — по нему строка узнаётся в таблице (null — добавлено в админке);
--   sheet_status / sheet_price у наличия — значения таблицы с прошлой синхронизации: таблица меняет
--   наличие и цену, только если они изменились в ней самой («кто изменил последним, тот и прав»).
alter table product_lines add column if not exists sheet_key text;
alter table items         add column if not exists sheet_key text;
alter table item_stock    add column if not exists sheet_status text;
alter table item_stock    add column if not exists sheet_price numeric(10, 2);
alter table store_settings add column if not exists synced_at timestamptz;  -- последняя синхронизация
alter table store_settings add column if not exists sync_lock timestamptz;  -- идёт синхронизация (защита от двойного запуска)
create unique index if not exists product_lines_sheet_key_uq on product_lines (category_id, sheet_key);
create unique index if not exists items_sheet_key_uq on items (line_id, sheet_key);

-- updated_at обновляется сам.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists product_lines_touch on product_lines;
create trigger product_lines_touch before update on product_lines for each row execute function touch_updated_at();
drop trigger if exists items_touch on items;
create trigger items_touch before update on items for each row execute function touch_updated_at();
drop trigger if exists item_stock_touch on item_stock;
create trigger item_stock_touch before update on item_stock for each row execute function touch_updated_at();
drop trigger if exists store_settings_touch on store_settings;
create trigger store_settings_touch before update on store_settings for each row execute function touch_updated_at();
drop trigger if exists sheet_overrides_touch on sheet_overrides;
create trigger sheet_overrides_touch before update on sheet_overrides for each row execute function touch_updated_at();

-- Безопасность: RLS включён и политик нет — публичный (anon) ключ не может ни читать,
-- ни писать. Сайт работает только с сервера через service_role-ключ.
alter table categories    enable row level security;
alter table product_lines enable row level security;
alter table items         enable row level security;
alter table item_stock    enable row level security;
alter table store_settings  enable row level security;
alter table sheet_overrides enable row level security;

-- Бакет для фото товаров (публичное чтение по ссылке, загрузка — только с сервера).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

-- Стартовые категории (импорт добавит недостающие сам).
insert into categories (id, title, sort) values
  ('liquids',     'Жидкости',     10),
  ('consumables', 'Расходники',   20),
  ('disposables', 'Одноразки',    30),
  ('snus',        'Снюс',         40),
  ('strips',      'Пластины',     50),
  ('pods',        'Поды',         60),
  ('coils',       'Койлы и вата', 70),
  ('hookah',      'Кальян',       80),
  ('drinks',      'Напитки',      90)
on conflict (id) do nothing;

-- Чтобы API базы сразу увидел новые колонки.
notify pgrst, 'reload schema';

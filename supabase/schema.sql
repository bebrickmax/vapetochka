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

-- Безопасность: RLS включён и политик нет — публичный (anon) ключ не может ни читать,
-- ни писать. Сайт работает только с сервера через service_role-ключ.
alter table categories    enable row level security;
alter table product_lines enable row level security;
alter table items         enable row level security;
alter table item_stock    enable row level security;

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

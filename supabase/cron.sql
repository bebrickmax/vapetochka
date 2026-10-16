-- ════════════════════════════════════════════════════════════════════════════
--  Автообновление сайта раз в 10 минут (Supabase → pg_cron + pg_net, бесплатно).
--  Заодно это не даёт бесплатному проекту Supabase «уснуть» из-за отсутствия запросов.
--  Выполнить один раз: Supabase → SQL Editor → вставить → Run.
--  Перед запуском замените значения в двух строках, помеченных «ЗАМЕНИТЕ».
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Адрес сайта и секрет (тот же, что REVALIDATE_SECRET в Vercel).
-- ЗАМЕНИТЕ: адрес сайта без / в конце.
-- ЗАМЕНИТЕ: секрет из REVALIDATE_SECRET.
select cron.unschedule('vapetochka-refresh') where exists (select 1 from cron.job where jobname = 'vapetochka-refresh');
select cron.schedule(
  'vapetochka-refresh',
  '*/10 * * * *',
  $$
    select net.http_get(
      url := 'https://ЗАМЕНИТЕ-САЙТ.vercel.app/api/revalidate',
      headers := jsonb_build_object('x-revalidate-secret', 'ЗАМЕНИТЕ-СЕКРЕТ')
    );
  $$
);

-- ════════════════════════════════════════════════════════════════════════════
--  Автообновление сайта раз в 10 минут (Supabase → pg_cron + pg_net, бесплатно).
--  Заодно это не даёт бесплатному проекту Supabase «уснуть» из-за отсутствия запросов.
--
--  Выполнить один раз: Supabase → SQL Editor → New query → вставить → замените секрет → Run.
--  Повторный запуск безопасен: задание пересоздаётся, копии не плодятся.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Старое задание с тем же именем (если файл уже запускали) — убрать.
select cron.unschedule(jobid) from cron.job where jobname = 'vapetochka-refresh';

select cron.schedule(
  'vapetochka-refresh',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://vapetochka.vercel.app/api/revalidate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- ЗАМЕНИТЕ: то же значение, что REVALIDATE_SECRET в Vercel (в одинарных кавычках).
        'x-revalidate-secret', 'ЗАМЕНИТЕ-СЕКРЕТ'
      ),
      body := '{}'::jsonb,
      -- Синхронизация с таблицей и фото идёт до полуминуты, а по умолчанию pg_net ждёт ответа только 5 секунд.
      timeout_milliseconds := 120000
    );
  $job$
);

-- Проверка (можно выполнить отдельно минут через 10–15):
--   select jobid, jobname, schedule, active from cron.job where jobname = 'vapetochka-refresh';
--   select status, return_message, start_time from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'vapetochka-refresh')
--     order by start_time desc limit 5;
--   select status_code, left(content::text, 200) as answer, created from net._http_response order by created desc limit 5;
-- В ответе сайта должно быть "ok":true. 401 — неверный секрет.
--
-- Выключить автообновление:  select cron.unschedule('vapetochka-refresh');

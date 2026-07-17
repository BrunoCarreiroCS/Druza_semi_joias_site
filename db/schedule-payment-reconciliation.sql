-- Executar depois de publicar reconcile-stale-payments.
-- O endpoint nao recebe segredo nem parametros e possui lock duravel no banco.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'druza-reconcile-stale-payments';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;

select cron.schedule(
  'druza-reconcile-stale-payments',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/reconcile-stale-payments',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $job$
);

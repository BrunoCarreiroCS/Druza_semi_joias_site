-- Executar somente depois de provisionar o mesmo secret HMAC no Vault e nas
-- Edge Function secrets. O cron e o unico consumidor intencional autorizado.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $reconcile_preflight$
declare
  v_secret_count integer;
  v_secret text;
begin
  select count(*), min(decrypted_secret)
  into v_secret_count, v_secret
  from vault.decrypted_secrets
  where name = 'druza_reconcile_cron_hmac';

  if v_secret_count <> 1 then
    raise exception 'reconcile_cron_hmac_secret_count_invalid';
  end if;
  if v_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'reconcile_cron_hmac_secret_format_invalid';
  end if;
end
$reconcile_preflight$;

do $reconcile_schedule$
declare
  v_job_count integer;
  v_job_id bigint;
  v_job_command text := $job$
    do $reconcile$
    declare
      v_secret text;
      v_timestamp text;
      v_body_hash text;
      v_message text;
      v_signature text;
    begin
      select decrypted_secret
      into strict v_secret
      from vault.decrypted_secrets
      where name = 'druza_reconcile_cron_hmac';

      if v_secret !~ '^[0-9a-f]{64}$' then
        raise exception 'reconcile_cron_hmac_secret_format_invalid';
      end if;

      v_timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
      v_body_hash := encode(
        extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
        'hex'
      );
      v_message := concat_ws(
        chr(10),
        'v1',
        v_timestamp,
        'POST',
        '/functions/v1/reconcile-stale-payments',
        v_body_hash
      );
      v_signature := 'v1=' || encode(
        extensions.hmac(
          convert_to(v_message, 'UTF8'),
          decode(v_secret, 'hex'),
          'sha256'
        ),
        'hex'
      );

      perform net.http_post(
        url := 'https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/reconcile-stale-payments',
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-druza-timestamp', v_timestamp,
          'x-druza-signature', v_signature
        ),
        timeout_milliseconds := 15000
      );
    exception
      when no_data_found or too_many_rows then
        raise exception 'reconcile_cron_hmac_secret_count_invalid';
    end
    $reconcile$;
  $job$;
begin
  select count(*), min(jobid)
  into v_job_count, v_job_id
  from cron.job
  where jobname = 'druza-reconcile-stale-payments';

  if v_job_count > 1 then
    raise exception 'reconcile_cron_job_count_invalid';
  end if;

  if v_job_count = 0 then
    perform cron.schedule(
      'druza-reconcile-stale-payments',
      '*/5 * * * *',
      v_job_command
    );
  else
    perform cron.alter_job(
      job_id := v_job_id,
      schedule := '*/5 * * * *',
      command := v_job_command,
      database := 'postgres',
      username := 'postgres',
      active := true
    );
  end if;
end
$reconcile_schedule$;

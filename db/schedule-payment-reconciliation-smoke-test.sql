-- Executar depois de db/schedule-payment-reconciliation.sql.
-- Teste exclusivo de metadados e criptografia sintetica. Nao chama o endpoint,
-- nao executa RPCs e nunca retorna o secret real nem o comando do job.

begin;

do $p1a_smoke$
declare
  -- Fixture publica de teste; nunca usar como secret real.
  v_fixture_secret constant text :=
    '00112233445566778899aabbccddeefffedcba98765432100123456789abcdef';
  v_fixture_timestamp constant text := '1764201600';
  v_fixture_body_hash constant text :=
    '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
  v_fixture_hmac constant text :=
    '3e94d28afeebc0e759e3d4f26038d1fd3b54e1246e3c883fd39e61354bb2f1fd';
  v_fixture_message text;
  v_actual_body_hash text;
  v_actual_hmac text;
  v_secret_count integer;
  v_secret text;
  v_job_count integer;
  v_job_active boolean;
  v_job_schedule text;
  v_job_database text;
  v_job_username text;
  v_job_command text;
begin
  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto'
      and n.nspname = 'extensions'
      and string_to_array(e.extversion, '.')::integer[] >= array[1, 3]
  ) then
    raise exception 'p1a_smoke_pgcrypto_invalid';
  end if;

  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_cron'
      and n.nspname = 'pg_catalog'
      and string_to_array(e.extversion, '.')::integer[] >= array[1, 6, 4]
  ) then
    raise exception 'p1a_smoke_pg_cron_invalid';
  end if;

  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net'
      and n.nspname = 'extensions'
      and string_to_array(e.extversion, '.')::integer[] >= array[0, 20, 3]
  ) then
    raise exception 'p1a_smoke_pg_net_invalid';
  end if;

  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'supabase_vault'
      and n.nspname = 'vault'
      and string_to_array(e.extversion, '.')::integer[] >= array[0, 3, 1]
  ) then
    raise exception 'p1a_smoke_vault_invalid';
  end if;

  if to_regprocedure(
    'cron.alter_job(bigint,text,text,text,text,boolean)'
  ) is null then
    raise exception 'p1a_smoke_rollback_api_missing';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron'
      and p.proname = 'alter_job'
      and p.proargnames = array[
        'job_id', 'schedule', 'command', 'database', 'username', 'active'
      ]::text[]
  ) then
    raise exception 'p1a_smoke_rollback_argument_names_invalid';
  end if;
  if to_regprocedure(
    'net.http_post(text,jsonb,jsonb,jsonb,integer)'
  ) is null then
    raise exception 'p1a_smoke_http_post_api_missing';
  end if;
  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'p1a_smoke_pgcrypto_api_missing';
  end if;

  v_actual_body_hash := encode(
    extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
    'hex'
  );
  if v_actual_body_hash <> v_fixture_body_hash then
    raise exception 'p1a_smoke_body_digest_mismatch';
  end if;

  v_fixture_message := concat_ws(
    chr(10),
    'v1',
    v_fixture_timestamp,
    'POST',
    '/functions/v1/reconcile-stale-payments',
    v_fixture_body_hash
  );
  v_actual_hmac := encode(
    extensions.hmac(
      convert_to(v_fixture_message, 'UTF8'),
      decode(v_fixture_secret, 'hex'),
      'sha256'
    ),
    'hex'
  );
  if v_actual_hmac <> v_fixture_hmac then
    raise exception 'p1a_smoke_hmac_vector_mismatch';
  end if;

  select count(*), min(decrypted_secret)
  into v_secret_count, v_secret
  from vault.decrypted_secrets
  where name = 'druza_reconcile_cron_hmac';

  if v_secret_count <> 1 then
    raise exception 'p1a_smoke_secret_count_invalid';
  end if;
  if v_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'p1a_smoke_secret_format_invalid';
  end if;

  select count(*), bool_and(active), min(schedule), min(database),
         min(username), min(command)
  into v_job_count, v_job_active, v_job_schedule, v_job_database,
       v_job_username, v_job_command
  from cron.job
  where jobname = 'druza-reconcile-stale-payments';

  if v_job_count <> 1 or v_job_active is not true
     or v_job_schedule <> '*/5 * * * *'
     or v_job_database is distinct from 'postgres'
     or v_job_username is distinct from 'postgres' then
    raise exception 'p1a_smoke_job_metadata_invalid';
  end if;
  if position('do $reconcile$' in lower(v_job_command)) = 0
     or position('vault.decrypted_secrets' in lower(v_job_command)) = 0
     or position('extensions.hmac' in lower(v_job_command)) = 0
     or position('/functions/v1/reconcile-stale-payments' in v_job_command) = 0
     or position('x-druza-timestamp' in lower(v_job_command)) = 0
     or position('x-druza-signature' in lower(v_job_command)) = 0 then
    raise exception 'p1a_smoke_job_auth_markers_missing';
  end if;
  if v_job_command ~* '(authorization|apikey|service_role|sb_secret_)'
     or v_job_command ~ '[0-9a-fA-F]{64}' then
    raise exception 'p1a_smoke_job_contains_credential_literal';
  end if;
  if position(v_secret in v_job_command) > 0 then
    raise exception 'p1a_smoke_job_contains_vault_secret';
  end if;

  raise notice 'P1A reconciler HMAC smoke test: OK';
end
$p1a_smoke$;

rollback;

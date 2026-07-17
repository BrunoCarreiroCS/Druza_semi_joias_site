-- Executar somente depois de db/security-final-hardening.sql.
-- O teste usa uma transacao e termina em ROLLBACK: nenhum fixture permanece.

begin;

do $$
declare
  v_user_id uuid;
  v_address_id uuid;
  v_order jsonb;
  v_order_id uuid;
  v_total integer;
  v_claim_one jsonb;
  v_claim_two jsonb;
  v_payment_id text;
  v_applied jsonb;
  v_duplicate jsonb;
  v_status text;
  v_stock integer;
  v_address_city text;
  v_snapshot_city text;
begin
  if has_table_privilege('authenticated', 'public.orders', 'INSERT')
     or has_table_privilege('authenticated', 'public.order_items', 'INSERT') then
    raise exception 'test_failed_client_can_insert_orders';
  end if;
  if has_column_privilege(
    'authenticated', 'public.profiles', 'payment_customer_id', 'SELECT'
  ) then
    raise exception 'test_failed_internal_profile_column_exposed';
  end if;

  select user_id, id into v_user_id, v_address_id
  from public.addresses
  order by created_at
  limit 1;
  if not found then
    raise exception 'test_requires_one_existing_address';
  end if;

  insert into public.products (
    slug, name, category, price_cents, active,
    in_stock, stock_quantity, featured
  ) values (
    'security-smoke-test', 'Security Smoke Test', 'testes', 1000,
    true, true, 5, false
  );

  -- Perfis legados podem estar incompletos. O fixture fica valido somente
  -- dentro desta transacao e volta ao estado original no ROLLBACK.
  update public.profiles
  set full_name = 'Security Smoke Test',
      phone = '+5511999999999',
      birth_date = (private.current_brazil_date() - interval '30 years')::date
  where id = v_user_id;

  v_order := public.create_reserved_order(
    v_user_id,
    v_address_id,
    '[{"slug":"security-smoke-test","qty":1}]'::jsonb,
    null
  );
  v_order_id := (v_order->>'order_id')::uuid;
  v_total := (v_order->>'total_cents')::integer;

  select city into v_address_city
  from public.addresses where id = v_address_id;
  select shipping_address_snapshot->>'city' into v_snapshot_city
  from public.orders where id = v_order_id;
  if v_snapshot_city is distinct from v_address_city then
    raise exception 'test_failed_address_snapshot';
  end if;
  update public.addresses set city = 'Cidade Alterada' where id = v_address_id;
  select shipping_address_snapshot->>'city' into v_snapshot_city
  from public.orders where id = v_order_id;
  if v_snapshot_city is distinct from v_address_city then
    raise exception 'test_failed_address_snapshot_immutable';
  end if;

  select stock_quantity into v_stock
  from public.products where slug = 'security-smoke-test';
  if v_stock <> 4 then raise exception 'test_failed_stock_reservation'; end if;

  v_claim_one := public.claim_payment_attempt(
    v_order_id, v_user_id, repeat('a', 64)
  );
  v_claim_two := public.claim_payment_attempt(
    v_order_id, v_user_id, repeat('a', 64)
  );
  if v_claim_one->>'attempt_key' is distinct from v_claim_two->>'attempt_key' then
    raise exception 'test_failed_idempotent_claim';
  end if;

  v_payment_id := '99' || floor(
    extract(epoch from clock_timestamp()) * 1000
  )::bigint::text;
  v_applied := public.apply_payment_event(
    repeat('b', 64), 'process-payment', v_order_id,
    v_payment_id, 'approved', v_total, v_order_id::text,
    now(), null
  );
  v_duplicate := public.apply_payment_event(
    repeat('b', 64), 'webhook', v_order_id,
    v_payment_id, 'approved', v_total, v_order_id::text,
    now(), null
  );
  if v_applied->>'state' <> 'applied'
     or v_duplicate->>'state' <> 'duplicate' then
    raise exception 'test_failed_webhook_replay';
  end if;

  select status into v_status from public.orders where id = v_order_id;
  if v_status <> 'paid' then raise exception 'test_failed_payment_state'; end if;

  begin
    update public.orders set status = 'pending' where id = v_order_id;
    raise exception 'test_failed_invalid_transition_was_allowed';
  exception
    when check_violation then null;
  end;

  begin
    perform public.apply_payment_event(
      repeat('c', 64), 'webhook', v_order_id,
      (v_payment_id::numeric + 1)::text, 'pending', v_total + 1,
      v_order_id::text, now(), null
    );
    raise exception 'test_failed_amount_mismatch_was_allowed';
  exception
    when data_exception then null;
  end;
end $$;

rollback;

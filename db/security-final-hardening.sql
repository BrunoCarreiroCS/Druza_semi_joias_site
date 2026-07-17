-- =====================================================================
-- DRUZA - endurecimento final de seguranca, pagamentos e estoque
-- Data: 17/07/2026
--
-- Aplicar como uma unica migracao. O arquivo e idempotente para permitir
-- nova execucao depois de uma falha transacional.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Area privada e rate limit duravel
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.edge_rate_limits (
  scope         text not null,
  key_hash      text not null,
  window_start  timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at    timestamptz not null default now(),
  primary key (scope, key_hash, window_start),
  constraint edge_rate_limits_scope_format
    check (scope ~ '^[a-z0-9:_-]{1,64}$'),
  constraint edge_rate_limits_key_hash_format
    check (key_hash ~ '^[a-f0-9]{64}$')
);

alter table private.edge_rate_limits enable row level security;
revoke all on private.edge_rate_limits from public, anon, authenticated;

create or replace function private.is_valid_br_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_phone ~ '^\+55[0-9]{10,11}$'
    and substring(p_phone from 4 for 2) in (
      '11','12','13','14','15','16','17','18','19',
      '21','22','24','27','28',
      '31','32','33','34','35','37','38',
      '41','42','43','44','45','46','47','48','49',
      '51','53','54','55',
      '61','62','63','64','65','66','67','68','69',
      '71','73','74','75','77','79',
      '81','82','83','84','85','86','87','88','89',
      '91','92','93','94','95','96','97','98','99'
    )
    and substring(p_phone from 6) ~ '^([2-5][0-9]{7}|9[0-9]{8})$', false);
$$;

create or replace function private.current_brazil_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function private.profile_is_complete(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.full_name is not null
      and length(btrim(p.full_name)) between 3 and 120
      and p.full_name !~ '[[:cntrl:]]'
      and private.is_valid_br_phone(p.phone)
      and p.birth_date is not null
      and p.birth_date <= (private.current_brazil_date() - interval '18 years')::date
      and p.birth_date >= (private.current_brazil_date() - interval '120 years')::date
  );
$$;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_scope is null
     or p_scope !~ '^[a-z0-9:_-]{1,64}$'
     or p_key_hash is null
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
    * p_window_seconds
  );

  insert into private.edge_rate_limits (
    scope, key_hash, window_start, request_count, updated_at
  ) values (
    p_scope, p_key_hash, v_window_start, 1, now()
  )
  on conflict (scope, key_hash, window_start)
  do update set
    request_count = private.edge_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into v_count;

  -- Limpeza oportunista, limitada a janelas antigas e sem dados de usuario.
  if random() < 0.01 then
    delete from private.edge_rate_limits
    where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Estoque quantitativo e sincronizacao do indicador publico
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists stock_quantity integer;

update public.products
set stock_quantity = case when in_stock then 1 else 0 end
where stock_quantity is null;

alter table public.products
  alter column stock_quantity set default 0,
  alter column stock_quantity set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_check
      check (stock_quantity >= 0);
  end if;
end $$;

create or replace function public.normalize_product_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_quantity is null or new.stock_quantity < 0 then
    raise exception 'invalid_stock_quantity' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.stock_quantity is not distinct from old.stock_quantity
     and new.in_stock is distinct from old.in_stock then
    if new.in_stock then
      new.stock_quantity := greatest(old.stock_quantity, 1);
    else
      new.stock_quantity := 0;
    end if;
  end if;

  new.in_stock := new.stock_quantity > 0;
  return new;
end;
$$;

drop trigger if exists products_normalize_inventory on public.products;
create trigger products_normalize_inventory
  before insert or update of stock_quantity, in_stock on public.products
  for each row execute function public.normalize_product_inventory();

update public.products set in_stock = stock_quantity > 0;

-- ---------------------------------------------------------------------
-- 3) Pedidos: tentativa idempotente, reserva e estado financeiro
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_attempt_key uuid,
  add column if not exists payment_attempt_fingerprint text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists shipping_address_snapshot jsonb,
  add column if not exists stock_reserved boolean not null default false,
  add column if not exists stock_released_at timestamptz,
  add column if not exists stock_consumed_at timestamptz,
  add column if not exists inventory_shortfall boolean not null default false,
  add column if not exists payment_status_updated_at timestamptz;

-- Pedidos financeiros existentes nao devem consumir o estoque novo em replay.
update public.orders
set stock_consumed_at = coalesce(paid_at, updated_at, created_at)
where status in ('paid', 'shipped', 'delivered', 'refunded')
  and stock_consumed_at is null;

-- O destino historico nao pode mudar se o cliente editar a agenda depois.
update public.orders o
set shipping_address_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'label', a.label,
  'recipient', a.recipient,
  'cep', a.cep,
  'street', a.street,
  'number', a.number,
  'complement', a.complement,
  'neighborhood', a.neighborhood,
  'city', a.city,
  'state', a.state
))
from public.addresses a
where o.shipping_address_id = a.id
  and o.shipping_address_snapshot is null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in (
    'pending', 'processing', 'paid', 'shipped',
    'delivered', 'canceled', 'refunded'
  ));

create or replace function private.enforce_order_profile_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.profile_is_complete(new.user_id) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_profile_requirements on public.orders;
create trigger orders_enforce_profile_requirements
  before insert on public.orders
  for each row execute function private.enforce_order_profile_requirements();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_amounts_nonnegative'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_amounts_nonnegative
      check (
        subtotal_cents >= 0 and shipping_cents >= 0
        and discount_cents >= 0 and total_cents >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_total_consistent'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_total_consistent
      check (total_cents = subtotal_cents - discount_cents + shipping_cents)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_attempt_fingerprint_format'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_attempt_fingerprint_format
      check (
        payment_attempt_fingerprint is null
        or payment_attempt_fingerprint ~ '^[a-f0-9]{64}$'
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_address_snapshot_object'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_shipping_address_snapshot_object
      check (
        shipping_address_snapshot is null
        or jsonb_typeof(shipping_address_snapshot) = 'object'
      ) not valid;
  end if;
end $$;

create index if not exists orders_shipping_address_id_idx
  on public.orders(shipping_address_id);
create index if not exists orders_reconciliation_idx
  on public.orders(status, processing_started_at)
  where status = 'processing';
create index if not exists orders_reservation_expiry_idx
  on public.orders(reservation_expires_at)
  where stock_reserved = true
    and stock_released_at is null
    and stock_consumed_at is null;
create unique index if not exists orders_mp_payment_id_unique_idx
  on public.orders(mp_payment_id)
  where mp_payment_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_price_nonnegative'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_price_nonnegative
      check (unit_price_cents >= 0) not valid;
  end if;
end $$;

-- Uma unica whitelist governa todas as mudancas de estado.
create or replace function private.order_transition_allowed(
  p_old text,
  p_new text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_old = p_new
    or (p_old = 'pending'    and p_new in ('processing', 'canceled'))
    or (p_old = 'processing' and p_new in ('pending', 'paid', 'canceled'))
    or (p_old = 'paid'       and p_new in ('shipped', 'refunded'))
    or (p_old = 'shipped'    and p_new in ('delivered', 'refunded'))
    or (p_old = 'delivered'  and p_new = 'refunded')
    or (p_old = 'canceled'   and p_new = 'paid');
$$;

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.order_transition_allowed(old.status, new.status) then
    raise exception 'invalid_order_status_transition'
      using errcode = '23514',
            detail = old.status || ' -> ' || new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_status_transition on public.orders;
create trigger orders_enforce_status_transition
  before update of status on public.orders
  for each row execute function public.enforce_order_status_transition();

-- ---------------------------------------------------------------------
-- 4) Enderecos: normalizacao, limites e UFs validas
-- ---------------------------------------------------------------------
create or replace function public.enforce_address_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address_count integer;
begin
  new.label := nullif(regexp_replace(btrim(coalesce(new.label, '')), '\s+', ' ', 'g'), '');
  new.recipient := nullif(regexp_replace(btrim(coalesce(new.recipient, '')), '\s+', ' ', 'g'), '');
  new.cep := regexp_replace(coalesce(new.cep, ''), '[^0-9]', '', 'g');
  new.street := nullif(regexp_replace(btrim(coalesce(new.street, '')), '\s+', ' ', 'g'), '');
  new.number := nullif(btrim(coalesce(new.number, '')), '');
  new.complement := nullif(regexp_replace(btrim(coalesce(new.complement, '')), '\s+', ' ', 'g'), '');
  new.neighborhood := nullif(regexp_replace(btrim(coalesce(new.neighborhood, '')), '\s+', ' ', 'g'), '');
  new.city := nullif(regexp_replace(btrim(coalesce(new.city, '')), '\s+', ' ', 'g'), '');
  new.state := upper(btrim(coalesce(new.state, '')));

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    select count(*) into v_address_count
    from public.addresses
    where user_id = new.user_id;
    if v_address_count >= 20 then
      raise exception 'address_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  if new.recipient is null or length(new.recipient) not between 3 and 120
     or new.cep !~ '^[0-9]{8}$'
     or new.street is null or length(new.street) not between 3 and 160
     or new.number is null or length(new.number) > 20
     or new.city is null or length(new.city) not between 2 and 80
     or new.state not in (
       'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
       'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
     )
     or length(coalesce(new.label, '')) > 40
     or length(coalesce(new.complement, '')) > 120
     or length(coalesce(new.neighborhood, '')) > 80 then
    raise exception 'invalid_address' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists addresses_enforce_requirements on public.addresses;
create trigger addresses_enforce_requirements
  before insert or update on public.addresses
  for each row execute function public.enforce_address_requirements();

create unique index if not exists addresses_one_default_per_user_idx
  on public.addresses(user_id)
  where is_default = true;

-- ---------------------------------------------------------------------
-- 5) Helpers internos de reserva/consumo de estoque
-- ---------------------------------------------------------------------
create or replace function private.release_order_reservation(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
     or not v_order.stock_reserved
     or v_order.stock_released_at is not null
     or v_order.stock_consumed_at is not null then
    return false;
  end if;

  for v_item in
    select product_slug, sum(qty)::integer as qty
    from public.order_items
    where order_id = p_order_id
    group by product_slug
    order by product_slug
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.qty
    where slug = v_item.product_slug;
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

create or replace function private.consume_order_inventory(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_available integer;
  v_shortfall boolean := false;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.stock_consumed_at is not null then
    return false;
  end if;

  -- Reserva ainda ativa: a quantidade ja foi decrementada na criacao.
  if v_order.stock_reserved and v_order.stock_released_at is null then
    update public.orders
    set stock_consumed_at = now()
    where id = p_order_id;
    return true;
  end if;

  -- Pagamento tardio ou pedido legado: consome o que estiver disponivel
  -- sem permitir estoque negativo e sinaliza falta para tratamento manual.
  for v_item in
    select product_slug, sum(qty)::integer as qty
    from public.order_items
    where order_id = p_order_id
    group by product_slug
    order by product_slug
  loop
    select stock_quantity into v_available
    from public.products
    where slug = v_item.product_slug
    for update;

    if not found then
      v_shortfall := true;
    else
      if v_available < v_item.qty then
        v_shortfall := true;
      end if;
      update public.products
      set stock_quantity = greatest(0, stock_quantity - v_item.qty)
      where slug = v_item.product_slug;
    end if;
  end loop;

  update public.orders
  set stock_consumed_at = now(),
      inventory_shortfall = inventory_shortfall or v_shortfall
  where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Criacao transacional do pedido com snapshot e reserva
-- ---------------------------------------------------------------------
create or replace function public.create_reserved_order(
  p_user_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_reservation_expires_at timestamptz := now() + interval '30 minutes';
  v_address public.addresses%rowtype;
  v_requested_count integer;
  v_distinct_count integer;
  v_found_count integer := 0;
  v_total_qty integer := 0;
  v_active_reservations integer;
  v_subtotal_big bigint := 0;
  v_subtotal integer;
  v_discount integer;
  v_shipping integer;
  v_total integer;
  v_snapshot jsonb := '[]'::jsonb;
  v_raw jsonb;
  v_product record;
  v_expired record;
begin
  if p_user_id is null or p_address_id is null
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_order_payload' using errcode = '22023';
  end if;

  v_requested_count := jsonb_array_length(p_items);
  if v_requested_count not between 1 and 20 then
    raise exception 'invalid_item_count' using errcode = '22023';
  end if;

  for v_raw in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_raw) <> 'object'
       or btrim(coalesce(v_raw->>'slug', '')) !~ '^[a-z0-9][a-z0-9-]{0,79}$'
       or coalesce(v_raw->>'qty', '') !~ '^[0-9]{1,2}$'
       or (v_raw->>'qty')::integer not between 1 and 10 then
      raise exception 'invalid_order_item' using errcode = '22023';
    end if;
    v_total_qty := v_total_qty + (v_raw->>'qty')::integer;
  end loop;

  if v_total_qty > 30 then
    raise exception 'item_quantity_limit' using errcode = '22023';
  end if;

  select count(distinct btrim(value->>'slug'))
  into v_distinct_count
  from jsonb_array_elements(p_items);

  select * into v_address
  from public.addresses
  where id = p_address_id and user_id = p_user_id;

  if not found then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('order:' || p_user_id::text, 0)
  );

  -- Libera reservas pending vencidas antes de aplicar o limite por usuario.
  for v_expired in
    select id
    from public.orders
    where user_id = p_user_id
      and status = 'pending'
      and stock_reserved = true
      and stock_released_at is null
      and stock_consumed_at is null
      and reservation_expires_at <= now()
    order by reservation_expires_at
    for update skip locked
  loop
    perform private.release_order_reservation(v_expired.id);
    update public.orders
    set status = 'canceled', payment_status = 'reservation_expired'
    where id = v_expired.id;
  end loop;

  select count(*) into v_active_reservations
  from public.orders
  where user_id = p_user_id
    and status in ('pending', 'processing')
    and stock_reserved = true
    and stock_released_at is null
    and stock_consumed_at is null
    and reservation_expires_at > now();

  if v_active_reservations >= 3 then
    raise exception 'active_reservation_limit' using errcode = 'P0001';
  end if;

  -- A ordenacao fixa dos locks evita deadlock entre carrinhos concorrentes.
  for v_product in
    with requested as (
      select btrim(value->>'slug') as slug,
             sum((value->>'qty')::integer)::integer as qty
      from jsonb_array_elements(p_items)
      group by btrim(value->>'slug')
    )
    select p.id, p.slug, p.name, p.price_cents, p.active,
           p.stock_quantity, requested.qty
    from requested
    join public.products p on p.slug = requested.slug
    order by p.slug
    for update of p
  loop
    v_found_count := v_found_count + 1;
    if not v_product.active then
      raise exception 'inactive_product' using errcode = 'P0001';
    end if;
    if v_product.stock_quantity < v_product.qty then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;

    v_subtotal_big := v_subtotal_big
      + (v_product.price_cents::bigint * v_product.qty::bigint);
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'id', v_product.id,
      'slug', v_product.slug,
      'name', v_product.name,
      'unit_price_cents', v_product.price_cents,
      'qty', v_product.qty
    ));
  end loop;

  if v_found_count <> v_distinct_count then
    raise exception 'invalid_product' using errcode = 'P0002';
  end if;
  if v_subtotal_big > 2147483647 then
    raise exception 'order_total_too_large' using errcode = '22003';
  end if;

  v_subtotal := v_subtotal_big::integer;
  v_discount := case
    when upper(btrim(coalesce(p_coupon_code, ''))) = 'PRIMEIRADRUZA'
      then round(v_subtotal::numeric * 0.10)::integer
    else 0
  end;
  v_shipping := case
    when v_subtotal >= 19900 then 0
    when left(v_address.cep, 2) in ('01','02','03','04') then 1490
    when left(v_address.cep, 2) in ('20','21','22','23','24') then 1890
    else 2190
  end;
  v_total := v_subtotal - v_discount + v_shipping;

  insert into public.orders (
    id, user_id, status, subtotal_cents, shipping_cents,
    discount_cents, total_cents, coupon_code, shipping_address_id,
    shipping_address_snapshot, reservation_expires_at, stock_reserved
  ) values (
    v_order_id, p_user_id, 'pending', v_subtotal, v_shipping,
    v_discount, v_total,
    case when v_discount > 0 then 'PRIMEIRADRUZA' else null end,
    p_address_id,
    jsonb_strip_nulls(jsonb_build_object(
      'label', v_address.label,
      'recipient', v_address.recipient,
      'cep', v_address.cep,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'neighborhood', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state
    )),
    v_reservation_expires_at, true
  );

  for v_raw in select value from jsonb_array_elements(v_snapshot)
  loop
    insert into public.order_items (
      order_id, product_slug, product_name, unit_price_cents, qty
    ) values (
      v_order_id,
      v_raw->>'slug',
      v_raw->>'name',
      (v_raw->>'unit_price_cents')::integer,
      (v_raw->>'qty')::integer
    );

    update public.products
    set stock_quantity = stock_quantity - (v_raw->>'qty')::integer
    where id = (v_raw->>'id')::uuid;
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_cents', v_total,
    'reservation_expires_at', v_reservation_expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Claim atomico da tentativa de pagamento
-- ---------------------------------------------------------------------
create or replace function public.claim_payment_attempt(
  p_order_id uuid,
  p_user_id uuid,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt_key uuid;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_payment_fingerprint' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status in ('paid', 'shipped', 'delivered', 'refunded') then
    return jsonb_build_object(
      'state', 'already_processed',
      'order_status', v_order.status,
      'payment_status', v_order.payment_status
    );
  end if;

  if v_order.status = 'canceled' then
    raise exception 'order_canceled' using errcode = 'P0001';
  end if;

  if v_order.stock_reserved
     and v_order.stock_released_at is null
     and v_order.stock_consumed_at is null
     and v_order.reservation_expires_at <= now() then
    perform private.release_order_reservation(v_order.id);
    update public.orders
    set status = 'canceled', payment_status = 'reservation_expired'
    where id = v_order.id;
    return jsonb_build_object(
      'state', 'reservation_expired',
      'order_status', 'canceled'
    );
  end if;

  if v_order.status = 'processing' then
    if v_order.payment_attempt_fingerprint = p_fingerprint
       and v_order.payment_attempt_key is not null then
      return jsonb_build_object(
        'state', 'replay',
        'attempt_key', v_order.payment_attempt_key,
        'total_cents', v_order.total_cents
      );
    end if;
    raise exception 'payment_in_progress' using errcode = '55P03';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'invalid_order_state' using errcode = 'P0001';
  end if;

  v_attempt_key := gen_random_uuid();
  update public.orders
  set status = 'processing',
      payment_attempt_key = v_attempt_key,
      payment_attempt_fingerprint = p_fingerprint,
      processing_started_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'state', 'claimed',
    'attempt_key', v_attempt_key,
    'total_cents', v_order.total_cents
  );
end;
$$;

create or replace function public.cancel_payment_attempt(
  p_order_id uuid,
  p_attempt_key uuid,
  p_reason text default 'gateway_rejected'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_reason not in ('gateway_rejected', 'invalid_gateway_response') then
    raise exception 'invalid_cancel_reason' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
     or v_order.status <> 'processing'
     or v_order.payment_attempt_key is distinct from p_attempt_key then
    return false;
  end if;

  perform private.release_order_reservation(v_order.id);
  update public.orders
  set status = 'canceled',
      payment_status = p_reason,
      payment_attempt_key = null,
      payment_attempt_fingerprint = null,
      processing_started_at = null
  where id = v_order.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Ledger idempotente dos eventos e aplicacao financeira
-- ---------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  receipt_key      text primary key,
  mp_payment_id    text not null,
  mp_status        text not null,
  order_id         uuid not null references public.orders(id) on delete restrict,
  source           text not null,
  amount_cents     integer not null check (amount_cents >= 0),
  event_at         timestamptz,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  constraint payment_webhook_events_receipt_format
    check (receipt_key ~ '^[a-f0-9]{64}$'),
  constraint payment_webhook_events_payment_id_format
    check (mp_payment_id ~ '^[0-9]{1,32}$'),
  constraint payment_webhook_events_status_format
    check (mp_status ~ '^[a-z_]{2,40}$'),
  constraint payment_webhook_events_source_check
    check (source in ('webhook', 'process-payment', 'reconciler')),
  unique (mp_payment_id, mp_status)
);

create index if not exists payment_webhook_events_order_idx
  on public.payment_webhook_events(order_id, received_at desc);
alter table public.payment_webhook_events enable row level security;

create or replace function public.apply_payment_event(
  p_receipt_key text,
  p_source text,
  p_order_id uuid,
  p_mp_payment_id text,
  p_mp_status text,
  p_amount_cents integer,
  p_external_reference text,
  p_event_at timestamptz default null,
  p_reservation_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing record;
  v_target_status text;
  v_event_at timestamptz := coalesce(p_event_at, now());
  v_inserted text;
begin
  if p_receipt_key is null or p_receipt_key !~ '^[a-f0-9]{64}$'
     or p_source is null
     or p_source not in ('webhook', 'process-payment', 'reconciler')
     or p_order_id is null
     or p_mp_payment_id is null or p_mp_payment_id !~ '^[0-9]{1,32}$'
     or p_mp_status is null or p_mp_status !~ '^[a-z_]{2,40}$'
     or p_external_reference is null
     or p_external_reference <> p_order_id::text
     or p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'invalid_payment_event' using errcode = '22023';
  end if;

  select order_id, mp_payment_id, mp_status into v_existing
  from public.payment_webhook_events
  where receipt_key = p_receipt_key
     or (mp_payment_id = p_mp_payment_id and mp_status = p_mp_status)
  order by received_at
  limit 1;

  if found then
    if v_existing.order_id <> p_order_id
       or v_existing.mp_payment_id <> p_mp_payment_id then
      raise exception 'payment_event_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('state', 'duplicate');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_amount_cents <> v_order.total_cents then
    raise exception 'payment_amount_mismatch' using errcode = '22000';
  end if;
  if v_order.mp_payment_id is not null
     and v_order.mp_payment_id <> p_mp_payment_id then
    raise exception 'order_payment_conflict' using errcode = '23505';
  end if;

  insert into public.payment_webhook_events (
    receipt_key, mp_payment_id, mp_status, order_id,
    source, amount_cents, event_at
  ) values (
    p_receipt_key, p_mp_payment_id, p_mp_status, p_order_id,
    p_source, p_amount_cents, v_event_at
  )
  on conflict do nothing
  returning receipt_key into v_inserted;

  if v_inserted is null then
    select order_id, mp_payment_id into v_existing
    from public.payment_webhook_events
    where receipt_key = p_receipt_key
       or (mp_payment_id = p_mp_payment_id and mp_status = p_mp_status)
    limit 1;
    if v_existing.order_id <> p_order_id
       or v_existing.mp_payment_id <> p_mp_payment_id then
      raise exception 'payment_event_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('state', 'duplicate');
  end if;

  v_target_status := case
    when p_mp_status = 'approved' then 'paid'
    when p_mp_status in ('rejected', 'cancelled', 'canceled') then 'canceled'
    when p_mp_status in ('pending', 'in_process', 'authorized') then 'processing'
    when p_mp_status in ('refunded', 'charged_back')
      and v_order.status in ('paid', 'shipped', 'delivered') then 'refunded'
    when p_mp_status in ('refunded', 'charged_back')
      and v_order.status in ('pending', 'processing') then 'canceled'
    else null
  end;

  -- Um webhook aprovado pode chegar para um pedido legado ainda pending.
  -- A promocao continua obedecendo a whitelist em dois passos validos.
  if p_mp_status = 'approved' and v_order.status = 'pending' then
    update public.orders
    set status = 'processing',
        processing_started_at = coalesce(processing_started_at, now())
    where id = p_order_id;
    v_order.status := 'processing';
  end if;

  if p_mp_status = 'approved'
     and private.order_transition_allowed(v_order.status, 'paid') then
    perform private.consume_order_inventory(p_order_id);
  elsif v_target_status = 'canceled'
        and private.order_transition_allowed(v_order.status, 'canceled') then
    perform private.release_order_reservation(p_order_id);
  end if;

  update public.orders
  set mp_payment_id = p_mp_payment_id,
      payment_ref = p_mp_payment_id,
      payment_status = case
        when payment_status_updated_at is null
          or v_event_at >= payment_status_updated_at then p_mp_status
        else payment_status
      end,
      payment_status_updated_at = greatest(
        coalesce(payment_status_updated_at, '-infinity'::timestamptz),
        v_event_at
      ),
      paid_at = case
        when p_mp_status = 'approved' then coalesce(paid_at, v_event_at)
        else paid_at
      end,
      reservation_expires_at = case
        when p_mp_status in ('pending', 'in_process', 'authorized')
          and stock_reserved
          and stock_released_at is null
          and stock_consumed_at is null
          and p_reservation_expires_at > now()
        then least(p_reservation_expires_at, now() + interval '7 days')
        else reservation_expires_at
      end,
      status = case
        when v_target_status is not null
          and private.order_transition_allowed(status, v_target_status)
        then v_target_status
        else status
      end
  where id = p_order_id;

  update public.payment_webhook_events
  set processed_at = now()
  where receipt_key = p_receipt_key;

  select * into v_order from public.orders where id = p_order_id;
  return jsonb_build_object(
    'state', 'applied',
    'order_status', v_order.status,
    'payment_status', v_order.payment_status,
    'inventory_shortfall', v_order.inventory_shortfall
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9) Reconciliacao de tentativas travadas e reservas vencidas
-- ---------------------------------------------------------------------
create or replace function public.list_payment_reconciliation_candidates(
  p_limit integer default 25
)
returns table (
  order_id uuid,
  mp_payment_id text,
  payment_attempt_key uuid,
  processing_started_at timestamptz,
  reservation_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select o.id, o.mp_payment_id, o.payment_attempt_key,
         o.processing_started_at, o.reservation_expires_at
  from public.orders o
  where o.status = 'processing'
    and o.processing_started_at <= now() - interval '15 minutes'
  order by o.processing_started_at
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

create or replace function public.reconcile_payment_not_found(
  p_order_id uuid,
  p_attempt_key uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
     or v_order.status <> 'processing'
     or v_order.processing_started_at > now() - interval '15 minutes'
     or v_order.payment_attempt_key is distinct from p_attempt_key then
    return 'no_op';
  end if;

  if v_order.stock_reserved
     and v_order.stock_released_at is null
     and v_order.stock_consumed_at is null
     and v_order.reservation_expires_at <= now() then
    perform private.release_order_reservation(v_order.id);
    update public.orders
    set status = 'canceled',
        payment_status = 'reservation_expired',
        payment_attempt_key = null,
        payment_attempt_fingerprint = null,
        processing_started_at = null
    where id = v_order.id;
    return 'canceled';
  end if;

  update public.orders
  set status = 'pending',
      payment_attempt_key = null,
      payment_attempt_fingerprint = null,
      processing_started_at = null
  where id = v_order.id;
  return 'pending';
end;
$$;

create or replace function public.release_expired_pending_reservations(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id
    from public.orders
    where status = 'pending'
      and stock_reserved = true
      and stock_released_at is null
      and stock_consumed_at is null
      and reservation_expires_at <= now()
    order by reservation_expires_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    perform private.release_order_reservation(v_order.id);
    update public.orders
    set status = 'canceled', payment_status = 'reservation_expired'
    where id = v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 10) RLS e privilegios minimos
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.products enable row level security;
alter table public.admins enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.payment_webhook_events enable row level security;

-- Remove ACLs herdados, inclusive TRUNCATE/REFERENCES/TRIGGER.
revoke all on all tables in schema public from anon, authenticated;

grant select (id, full_name, phone, birth_date, marketing_consent,
              consent_date, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, phone, birth_date, marketing_consent)
  on public.profiles to authenticated;

grant select on public.addresses to authenticated;
grant insert (user_id, label, recipient, cep, street, number, complement,
              neighborhood, city, state, is_default)
  on public.addresses to authenticated;
grant update (label, recipient, cep, street, number, complement,
              neighborhood, city, state, is_default)
  on public.addresses to authenticated;
grant delete on public.addresses to authenticated;

grant select (
  id, status, subtotal_cents, shipping_cents, discount_cents,
  total_cents, coupon_code, shipping_address_id, created_at,
  updated_at, payment_status, tracking_code, paid_at, reservation_expires_at
) on public.orders to authenticated;

grant select (id, order_id, product_slug, product_name, unit_price_cents, qty)
  on public.order_items to authenticated;
grant select on public.products to anon, authenticated;
grant select (user_id, created_at) on public.admins to authenticated;

grant all on all tables in schema public to service_role;

-- Politicas com papeis explicitos e auth.uid() avaliado uma vez.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own"
  on public.addresses for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own"
  on public.addresses for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own"
  on public.addresses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own"
  on public.addresses for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "orders_insert_own_pending" on public.orders;
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "order_items_insert_own" on public.order_items;
drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "products_select_active" on public.products;
create policy "products_select_active"
  on public.products for select to anon, authenticated
  using (active = true);

drop policy if exists "admins_select_own" on public.admins;
create policy "admins_select_own"
  on public.admins for select to authenticated
  using ((select auth.uid()) = user_id);

-- Sem policies em audit log e eventos: somente service_role acessa.

-- ---------------------------------------------------------------------
-- 11) Funcoes, search_path e defaults seguros
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_profile_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.full_name := nullif(
    regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g'),
    ''
  );
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g'), '');

  if new.phone ~ '^55[0-9]{10,11}$' then
    new.phone := '+' || new.phone;
  elsif new.phone ~ '^[0-9]{10,11}$' then
    new.phone := '+55' || new.phone;
  end if;

  if new.full_name is null or length(new.full_name) not between 3 and 120
     or new.full_name ~ '[[:cntrl:]]'
     or not coalesce(private.is_valid_br_phone(new.phone), false)
     or new.birth_date is null
     or new.birth_date > (private.current_brazil_date() - interval '18 years')::date
     or new.birth_date < (private.current_brazil_date() - interval '120 years')::date then
    raise exception 'profile_required' using errcode = '23514';
  end if;

  if new.marketing_consent then
    if tg_op = 'INSERT' then
      new.consent_date := coalesce(new.consent_date, now());
    elsif not coalesce(old.marketing_consent, false) then
      new.consent_date := coalesce(new.consent_date, now());
    end if;
  else
    new.consent_date := null;
  end if;
  return new;
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.create_reserved_order(uuid, uuid, jsonb, text)
  to service_role;
grant execute on function public.claim_payment_attempt(uuid, uuid, text)
  to service_role;
grant execute on function public.cancel_payment_attempt(uuid, uuid, text)
  to service_role;
grant execute on function public.apply_payment_event(
  text, text, uuid, text, text, integer, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.list_payment_reconciliation_candidates(integer)
  to service_role;
grant execute on function public.reconcile_payment_not_found(uuid, uuid)
  to service_role;
grant execute on function public.release_expired_pending_reservations(integer)
  to service_role;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;

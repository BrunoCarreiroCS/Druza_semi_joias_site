-- =====================================================================
-- DRUZA SEMI JOIAS - schema.sql
-- Banco: PostgreSQL (Supabase). Rode este arquivo no SQL Editor do Supabase.
--
-- Seguranca:
-- - RLS em todas as tabelas do schema public.
-- - Cada cliente le/altera apenas os proprios dados.
-- - Senhas ficam somente no Supabase Auth, nunca em tabelas publicas.
-- - Dados pessoais obrigatorios no cadastro: nome, e-mail do Auth, telefone
--   brasileiro normalizado e data de nascimento com 18+.
-- - Dados de cartao nao sao armazenados aqui.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROFILES (1:1 com auth.users - dados pessoais do cliente)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  phone               text not null,
  birth_date          date not null,
  marketing_consent   boolean not null default false,
  consent_date        timestamptz,
  payment_customer_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint profiles_full_name_required check (length(btrim(full_name)) >= 3),
  constraint profiles_phone_format check (phone ~ '^\+55[1-9][1-9][0-9]{8,9}$'),
  constraint profiles_birth_date_age check (birth_date <= (current_date - interval '18 years')::date)
);

alter table public.profiles
  add column if not exists birth_date date;

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, birth_date, marketing_consent) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Normaliza e valida dados pessoais no banco. Isto protege contra chamadas
-- diretas ao Supabase que tentem burlar o HTML/JavaScript.
create or replace function public.enforce_profile_requirements()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := nullif(regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g'), '');
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g'), '');

  if new.phone ~ '^55[1-9][1-9][0-9]{8,9}$' then
    new.phone := '+' || new.phone;
  elsif new.phone ~ '^[1-9][1-9][0-9]{8,9}$' then
    new.phone := '+55' || new.phone;
  end if;

  if new.full_name is null or new.phone is null or new.birth_date is null then
    raise exception 'profile_required' using errcode = '23514';
  end if;

  if length(new.full_name) < 3 then
    raise exception 'profile_required' using errcode = '23514';
  end if;

  if new.phone !~ '^\+55[1-9][1-9][0-9]{8,9}$' then
    raise exception 'profile_phone_format' using errcode = '23514';
  end if;

  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'profile_birth_date_age' using errcode = '23514';
  end if;

  if new.marketing_consent is true then
    if tg_op = 'INSERT' then
      new.consent_date := coalesce(new.consent_date, now());
    elsif coalesce(old.marketing_consent, false) is false then
      new.consent_date := coalesce(new.consent_date, now());
    end if;
  elsif new.marketing_consent is false then
    new.consent_date := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_profile_requirements() from public, anon, authenticated;

drop trigger if exists profiles_enforce_requirements on public.profiles;
create trigger profiles_enforce_requirements
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_requirements();

-- ---------------------------------------------------------------------
-- 2) ADDRESSES (enderecos de entrega - N por usuario)
-- ---------------------------------------------------------------------
create table if not exists public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text,
  recipient    text not null,
  cep          text not null,
  street       text not null,
  number       text not null,
  complement   text,
  neighborhood text,
  city         text not null,
  state        text not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on public.addresses(user_id);

alter table public.addresses enable row level security;

revoke all on public.addresses from anon;
grant select, insert, update, delete on public.addresses to authenticated;
grant select, insert, update, delete on public.addresses to service_role;

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own"
  on public.addresses for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own"
  on public.addresses for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own"
  on public.addresses for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own"
  on public.addresses for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 3) ORDERS (pedidos - historico de compras)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending','paid','shipped','delivered','canceled','refunded')),
  subtotal_cents      integer not null default 0,
  shipping_cents      integer not null default 0,
  discount_cents      integer not null default 0,
  total_cents         integer not null default 0,
  coupon_code         text,
  payment_ref         text,
  shipping_address_id uuid references public.addresses(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);

alter table public.orders enable row level security;

revoke all on public.orders from anon;
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.orders to service_role;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 4) ORDER_ITEMS (itens de cada pedido)
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  product_slug     text not null,
  product_name     text not null,
  unit_price_cents integer not null,
  qty              integer not null default 1 check (qty > 0)
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.order_items enable row level security;

revoke all on public.order_items from anon;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.order_items to service_role;

drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 5) TRIGGER - cria profile automaticamente quando um usuario se registra
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  birth_date_text text;
begin
  birth_date_text := new.raw_user_meta_data->>'birth_date';

  if birth_date_text is null or birth_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'profile_required' using errcode = '23514';
  end if;

  insert into public.profiles (id, full_name, phone, birth_date, marketing_consent, consent_date)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    birth_date_text::date,
    coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false),
    case when coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false)
         then now() else null end
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6) updated_at automatico
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

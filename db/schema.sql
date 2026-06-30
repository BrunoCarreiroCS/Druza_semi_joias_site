-- =====================================================================
-- DRUZA SEMI JOIAS — schema.sql
-- Banco: PostgreSQL (Supabase). Rode este arquivo no SQL Editor do Supabase.
-- Segurança: Row Level Security (RLS) em TODAS as tabelas — cada usuário
-- só enxerga e altera os próprios dados. LGPD: consentimento e exclusão.
-- NÃO armazenamos dados de cartão aqui (PCI). O gateway (MercadoPago/Stripe)
-- tokeniza; guardamos apenas referências (customer_id, payment_ref).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROFILES  (1:1 com auth.users — dados pessoais do cliente)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text,
  phone             text,
  -- LGPD: consentimento explícito para marketing (promoções por e-mail)
  marketing_consent boolean not null default false,
  consent_date      timestamptz,
  -- Referência do cliente no gateway de pagamento (NUNCA o cartão em si)
  payment_customer_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Usuário lê o próprio perfil
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Usuário atualiza o próprio perfil
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 2) ADDRESSES  (endereços de entrega — N por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text,                         -- "Casa", "Trabalho"
  recipient    text not null,                -- nome de quem recebe
  cep          text not null,
  street       text not null,
  number       text not null,
  complement   text,
  neighborhood text,
  city         text not null,
  state        text not null,                -- UF
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on public.addresses(user_id);

alter table public.addresses enable row level security;

create policy "addresses_select_own"
  on public.addresses for select using (auth.uid() = user_id);
create policy "addresses_insert_own"
  on public.addresses for insert with check (auth.uid() = user_id);
create policy "addresses_update_own"
  on public.addresses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "addresses_delete_own"
  on public.addresses for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3) ORDERS  (pedidos — histórico de compras)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','paid','shipped','delivered','canceled','refunded')),
  subtotal_cents integer not null default 0,
  shipping_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents    integer not null default 0,
  coupon_code    text,
  -- Referência do pagamento no gateway (preenchida pelo webhook, lado servidor)
  payment_ref    text,
  shipping_address_id uuid references public.addresses(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);

alter table public.orders enable row level security;

-- Usuário lê os próprios pedidos. Inserção/alteração de status é feita pelo
-- backend de pagamento (service_role bypassa RLS) após confirmar pagamento.
create policy "orders_select_own"
  on public.orders for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4) ORDER_ITEMS  (itens de cada pedido)
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

-- Usuário lê itens de pedidos que são dele
create policy "order_items_select_own"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 5) TRIGGER  — cria profile automaticamente quando um usuário se registra
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, marketing_consent, consent_date)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false),
    case when (new.raw_user_meta_data->>'marketing_consent')::boolean
         then now() else null end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6) updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

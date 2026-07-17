-- =====================================================================
-- DRUZA SEMI JOIAS — schema-admin.sql
-- Painel administrativo: tabelas admins, products, admin_audit_log.
-- Rode este arquivo no SQL Editor do Supabase, DEPOIS de schema.sql e
-- schema-payments.sql (usa a função public.touch_updated_at() de lá).
--
-- MODELO DE SEGURANÇA (ver [[druza-next-steps]] / plano do painel admin):
--   - admins: NENHUMA política de insert/update/delete pro client (nem
--     pro próprio usuário) — só select-own, pra a UI perguntar "sou
--     admin?". Promoção a admin é manual, direto pelo SQL Editor,
--     nunca pelo site (evita auto-promoção).
--   - products: leitura pública só de produtos ativos; toda escrita
--     (criar/editar) passa pelas Edge Functions admin-*, que usam a
--     service_role só depois de confirmar que quem chamou está na
--     tabela admins. Não existe política de insert/update/delete pra
--     client aqui.
--   - admin_audit_log: zero acesso via client (nem select) — só a
--     service_role escreve (dentro das Edge Functions), só o dono lê
--     (Supabase Studio).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ADMINS — quem tem acesso ao painel administrativo
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,                          -- ex.: "dono da loja"
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

revoke all on public.admins from anon;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.admins to service_role;

-- Só permite o usuário ver a PRÓPRIA linha (pra o painel checar acesso).
-- NÃO existe policy de insert/update/delete: promoção a admin só é
-- feita manualmente por quem tem acesso direto ao banco (SQL Editor).
drop policy if exists "admins_select_own" on public.admins;
create policy "admins_select_own"
  on public.admins for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 2) PRODUCTS — catálogo operacional (preço/estoque/visibilidade).
--    Conteúdo rico (fotos, descrição, galeria) continua em js/catalog.js;
--    esta tabela é a fonte de verdade de preço/ativo, usada tanto pelo
--    checkout (create-preference) quanto pelo painel admin.
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,        -- bate com o "id" de cada produto em catalog.js
  name         text not null,
  category     text,
  price_cents  integer not null check (price_cents >= 0),
  active       boolean not null default true,   -- false = some do catálogo e do checkout
  in_stock     boolean not null default true,
  stock_quantity integer not null default 1 check (stock_quantity >= 0),
  featured     boolean not null default false,  -- true = aparece no grid de destaque da home
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Idempotente: se a tabela já existia sem a coluna (rodou uma versão
-- anterior deste arquivo), adiciona featured sem quebrar.
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists stock_quantity integer not null default 1;

create index if not exists products_slug_idx on public.products(slug);

alter table public.products enable row level security;

grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.products to service_role;

-- Leitura pública, mas só de produtos ativos (frontend/checkout).
drop policy if exists "products_select_active" on public.products;
create policy "products_select_active"
  on public.products for select
  to anon, authenticated
  using (active = true);

-- Nenhuma policy de insert/update/delete pro client: toda escrita passa
-- pelas Edge Functions admin-list-products / admin-upsert-product, que
-- usam a service_role depois de confirmar que o chamador é admin.

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Popula com os 7 produtos hoje hardcoded em js/catalog.js e no CATALOG
-- do create-preference (que só tinha 3 — esta tabela vira a única fonte
-- de verdade de preço/ativo dali pra frente).
insert into public.products (slug, name, category, price_cents, active, in_stock, featured)
values
  ('anel-coracao-esmeralda',  'Anel Coração Esmeralda',     'aneis',     18900, true, true, true),
  ('pulseira-riviera-prata',  'Pulseira Riviera Prata',     'pulseiras', 15900, true, true, true),
  ('anel-paraiba-quadrado',   'Anel Paraíba Quadrado',      'aneis',     21900, true, true, true),
  ('brinco-gota-esmeralda',   'Brinco Gota Esmeralda',      'brincos',   12900, true, true, false),
  ('argolinha-paraiba',       'Argolinha Paraíba',          'brincos',   14900, true, true, false),
  ('brinco-ponto-luz',        'Brinco Ponto de Luz',        'brincos',   11900, true, true, false),
  ('colar-ponto-luz-paraiba', 'Colar Ponto de Luz Paraíba', 'colares',   17900, true, true, false)
on conflict (slug) do nothing;

-- Garante o destaque dos 3 originais mesmo se as linhas já existiam de
-- uma execução anterior (o insert acima faz "do nothing" em conflito).
update public.products set featured = true
  where slug in ('anel-coracao-esmeralda', 'pulseira-riviera-prata', 'anel-paraiba-quadrado');

-- ---------------------------------------------------------------------
-- 3) ORDERS — campo de rastreio (usado pelo admin ao marcar "enviado")
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists tracking_code text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists admin_notes text;

-- admin_notes e interno do painel. Mantem a leitura do cliente limitada
-- coluna a coluna, deixando essa nota fora de qualquer select no browser.
revoke select on public.orders from anon, authenticated;
grant select (
  id,
  user_id,
  status,
  subtotal_cents,
  shipping_cents,
  discount_cents,
  total_cents,
  coupon_code,
  payment_ref,
  shipping_address_id,
  created_at,
  updated_at,
  mp_preference_id,
  mp_payment_id,
  payment_status,
  tracking_code,
  paid_at
) on public.orders to authenticated;

-- ---------------------------------------------------------------------
-- 4) ADMIN_AUDIT_LOG — rastro de ações administrativas
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  action        text not null,              -- ex.: "order.update_status", "product.upsert"
  target_table  text,
  target_id     text,
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_log_admin_idx on public.admin_audit_log(admin_user_id);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select, insert, update, delete on public.admin_audit_log to service_role;
-- Nenhuma policy: zero acesso via client (nem select). Só a service_role
-- (dentro das Edge Functions) escreve; consulta é direto no Supabase
-- Studio, pelo dono do projeto.

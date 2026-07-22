-- =====================================================================
-- DRUZA SEMI JOIAS - schema-catalog-inventory.sql
-- Catalogo completo, controle de estoque auditavel e logistica de envio.
--
-- Rodar no SQL Editor do Supabase DEPOIS de:
--   1) db/schema.sql
--   2) db/schema-payments.sql
--   3) db/schema-admin.sql
--   4) db/security-final-hardening.sql
--
-- O arquivo e idempotente: pode ser reexecutado com seguranca.
--
-- ---------------------------------------------------------------------
-- MODELO DE ESTOQUE (leia antes de mexer em qualquer coisa aqui)
--
-- public.products.stock_quantity guarda o estoque DISPONIVEL, nao o
-- fisico. Isso ja era verdade antes desta migracao: a funcao
-- create_reserved_order decrementa stock_quantity no instante em que o
-- pedido e criado (reserva), release_order_reservation devolve e
-- consume_order_inventory apenas confirma o consumo do que ja estava
-- reservado. Manter essa semantica intacta e o que garante que o
-- checkout, o webhook do MercadoPago e a reconciliacao continuem
-- funcionando exatamente como antes.
--
--   disponivel = products.stock_quantity
--   reservado  = soma dos itens de pedidos com reserva ativa
--   fisico     = disponivel + reservado
--
-- O reservado NAO e materializado em coluna: ele e derivado dos pedidos
-- por public.product_stock_snapshot(). Um numero derivado guardado em
-- dois lugares vira dois numeros diferentes no primeiro erro.
--
-- Toda alteracao de estoque - automatica ou manual - grava uma linha em
-- public.inventory_movements, que e imutavel por trigger.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) CATEGORIES - categorias gerenciaveis pelo painel
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  image_url       text,
  parent_id       uuid references public.categories(id) on delete set null,
  sort_order      integer not null default 0,
  active          boolean not null default true,
  seo_title       text,
  seo_description text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  constraint categories_name_length check (length(btrim(name)) between 2 and 80),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create index if not exists categories_parent_idx on public.categories(parent_id);
create index if not exists categories_sort_idx on public.categories(sort_order, name);

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- Semeia as categorias que ja existiam como texto solto em products.category
-- e as usadas hoje nos filtros de catalogo.html.
insert into public.categories (slug, name, sort_order)
values
  ('aneis',      'Anéis',        10),
  ('brincos',    'Brincos',      20),
  ('colares',    'Colares',      30),
  ('pulseiras',  'Pulseiras',    40),
  ('tornozeleiras', 'Tornozeleiras', 50),
  ('conjuntos',  'Conjuntos',    60),
  ('presentes',  'Presentes',    70)
on conflict (slug) do nothing;

-- Qualquer categoria que exista em products mas nao na tabela vira linha
-- propria, para nenhum produto perder a classificacao na migracao.
insert into public.categories (slug, name, sort_order)
select distinct p.category, initcap(replace(p.category, '-', ' ')), 900
from public.products p
where p.category is not null
  and btrim(p.category) <> ''
  and p.category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and not exists (select 1 from public.categories c where c.slug = p.category)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2) PRODUCTS - ficha completa da peca
--
-- As colunas antigas (category texto, active booleano, in_stock,
-- stock_quantity) continuam existindo e com o mesmo significado. O que
-- muda e que agora ha um `status` de tres estados e um `category_id`
-- relacional; ambos sao espelhados nas colunas antigas por trigger, de
-- forma que a policy products_select_active, o create_reserved_order e
-- o checkout seguem funcionando sem nenhuma alteracao.
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists sku                     text,
  add column if not exists status                  text,
  add column if not exists category_id             uuid references public.categories(id) on delete set null,
  add column if not exists collection              text,
  add column if not exists tags                    text[] not null default '{}',
  add column if not exists short_description       text,
  add column if not exists long_description        text,
  add column if not exists compare_at_price_cents  integer,
  add column if not exists promo_price_cents       integer,
  add column if not exists promo_starts_at         timestamptz,
  add column if not exists promo_ends_at           timestamptz,
  add column if not exists cost_cents              integer,
  add column if not exists min_stock               integer not null default 0,
  add column if not exists attributes              jsonb not null default '{}'::jsonb,
  add column if not exists seo_title               text,
  add column if not exists seo_description         text,
  add column if not exists archived_at             timestamptz;

update public.products
set status = case when active then 'active' else 'inactive' end
where status is null;

alter table public.products
  alter column status set default 'active',
  alter column status set not null;

-- Gera SKU para o acervo existente sem risco de colisao: prefixo DRZ +
-- sequencial estavel pela data de criacao.
with numbered as (
  select id, row_number() over (order by created_at, slug) as n
  from public.products
  where sku is null or btrim(sku) = ''
)
update public.products p
set sku = 'DRZ-' || lpad(numbered.n::text, 4, '0')
from numbered
where p.id = numbered.id
  and not exists (
    select 1 from public.products x
    where x.sku = 'DRZ-' || lpad(numbered.n::text, 4, '0')
  );

update public.products p
set category_id = c.id
from public.categories c
where p.category = c.slug
  and p.category_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_status_check' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_status_check
      check (status in ('active', 'inactive', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_sku_format' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_sku_format
      check (sku is null or (sku ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_money_nonnegative' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_money_nonnegative
      check (
        (compare_at_price_cents is null or compare_at_price_cents >= 0)
        and (promo_price_cents is null or promo_price_cents >= 0)
        and (cost_cents is null or cost_cents >= 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_min_stock_nonnegative' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_min_stock_nonnegative check (min_stock >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_promo_window' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_promo_window
      check (promo_starts_at is null or promo_ends_at is null or promo_ends_at > promo_starts_at);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_attributes_object' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_attributes_object
      check (jsonb_typeof(attributes) = 'object');
  end if;
end $$;

-- Coluna calculada pelo proprio banco para a tela "Estoque baixo" poder
-- filtrar sem trazer o catalogo inteiro para comparar em memoria.
alter table public.products
  add column if not exists low_stock boolean
  generated always as (stock_quantity <= min_stock) stored;

create unique index if not exists products_sku_unique_idx
  on public.products(sku) where sku is not null;
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_status_idx on public.products(status);
create index if not exists products_low_stock_idx
  on public.products(low_stock) where status = 'active';
create index if not exists products_created_at_idx on public.products(created_at desc);

-- Mantem as colunas herdadas em sincronia com as novas. Uma unica fonte
-- de verdade (status / category_id) escrita em dois lugares por trigger,
-- em vez de dois campos editaveis que podem divergir.
create or replace function public.sync_product_legacy_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_slug text;
begin
  if new.status is null then
    new.status := case when coalesce(new.active, true) then 'active' else 'inactive' end;
  end if;

  -- `status` manda, mas quem escrever so o booleano `active` (as chamadas
  -- antigas continuam fazendo isso) ainda e obedecido: o booleano vira
  -- status, e nao o contrario. Sem isso, um "desativar produto" pelo
  -- caminho antigo seria silenciosamente descartado.
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.active is distinct from old.active then
    new.status := case
      when new.active then 'active'
      when old.status = 'archived' then 'archived'
      else 'inactive'
    end;
  elsif tg_op = 'INSERT' and new.active is false and new.status = 'active' then
    new.status := 'inactive';
  end if;

  new.active := (new.status = 'active');
  new.archived_at := case
    when new.status = 'archived' then coalesce(new.archived_at, now())
    else null
  end;

  if new.category_id is not null then
    select slug into v_category_slug from public.categories where id = new.category_id;
    new.category := v_category_slug;
  end if;

  new.sku := nullif(upper(btrim(coalesce(new.sku, ''))), '');
  new.collection := nullif(btrim(coalesce(new.collection, '')), '');

  return new;
end;
$$;

drop trigger if exists products_sync_legacy_columns on public.products;
create trigger products_sync_legacy_columns
  before insert or update on public.products
  for each row execute function public.sync_product_legacy_columns();

-- Reaplica a sincronizacao ao acervo existente.
update public.products set status = status;

-- Preco que vale agora: promocional dentro da janela, senao o de venda.
-- Usado pelo create_reserved_order (servidor) e espelhado no storefront.
create or replace function public.effective_price_cents(
  p_price_cents integer,
  p_promo_price_cents integer,
  p_promo_starts_at timestamptz,
  p_promo_ends_at timestamptz
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_promo_price_cents is not null
      and p_promo_price_cents >= 0
      and (p_promo_starts_at is null or p_promo_starts_at <= now())
      and (p_promo_ends_at is null or p_promo_ends_at > now())
    then p_promo_price_cents
    else p_price_cents
  end;
$$;

-- ---------------------------------------------------------------------
-- 3) PRODUCT_IMAGES - galeria por produto
-- ---------------------------------------------------------------------
create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  alt         text,
  position    integer not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint product_images_url_length check (length(url) between 3 and 600),
  constraint product_images_alt_length check (alt is null or length(alt) <= 160),
  constraint product_images_position_range check (position between 0 and 50)
);

create index if not exists product_images_product_idx
  on public.product_images(product_id, position);
create unique index if not exists product_images_one_primary_idx
  on public.product_images(product_id) where is_primary = true;

-- Garante que exista no maximo uma imagem principal: marcar uma nova
-- desmarca a anterior, em vez de estourar o indice unico na cara da
-- usuaria.
create or replace function public.enforce_single_primary_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_primary then
    update public.product_images
    set is_primary = false
    where product_id = new.product_id
      and id <> new.id
      and is_primary = true;
  end if;
  return new;
end;
$$;

drop trigger if exists product_images_single_primary on public.product_images;
create trigger product_images_single_primary
  before insert or update of is_primary on public.product_images
  for each row when (new.is_primary = true)
  execute function public.enforce_single_primary_image();

-- ---------------------------------------------------------------------
-- 4) INVENTORY_MOVEMENTS - livro-razao imutavel do estoque
--
-- Toda mudanca de estoque passa por aqui, com saldo antes e depois. A
-- tabela nao aceita UPDATE nem DELETE (trigger abaixo): historico que
-- pode ser reescrito nao e historico.
-- ---------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid references public.products(id) on delete set null,
  product_slug     text not null,
  movement_type    text not null,
  quantity_change  integer not null,
  quantity_before  integer not null,
  quantity_after   integer not null,
  reason           text,
  note             text,
  supplier         text,
  unit_cost_cents  integer,
  order_id         uuid references public.orders(id) on delete set null,
  admin_user_id    uuid references auth.users(id) on delete set null,
  source           text not null default 'system',
  idempotency_key  text,
  created_at       timestamptz not null default now(),
  constraint inventory_movements_type_check check (movement_type in (
    'saldo_inicial',
    'entrada',
    'venda',
    'reserva',
    'liberacao_reserva',
    'devolucao',
    'troca',
    'ajuste_positivo',
    'ajuste_negativo',
    'perda',
    'avaria',
    'inventario'
  )),
  constraint inventory_movements_source_check check (source in (
    'system', 'admin', 'checkout', 'webhook', 'reconciler', 'migracao'
  )),
  constraint inventory_movements_balance_check
    check (quantity_after = quantity_before + quantity_change),
  constraint inventory_movements_nonnegative_balances
    check (quantity_before >= 0 and quantity_after >= 0),
  constraint inventory_movements_note_length check (note is null or length(note) <= 500),
  constraint inventory_movements_reason_length check (reason is null or length(reason) <= 120),
  constraint inventory_movements_supplier_length check (supplier is null or length(supplier) <= 120),
  constraint inventory_movements_cost_nonnegative
    check (unit_cost_cents is null or unit_cost_cents >= 0)
);

create index if not exists inventory_movements_product_idx
  on public.inventory_movements(product_id, created_at desc);
create index if not exists inventory_movements_created_idx
  on public.inventory_movements(created_at desc);
create index if not exists inventory_movements_order_idx
  on public.inventory_movements(order_id) where order_id is not null;
create unique index if not exists inventory_movements_idempotency_idx
  on public.inventory_movements(idempotency_key) where idempotency_key is not null;

create or replace function public.block_inventory_movement_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'inventory_movements_is_append_only' using errcode = '42501';
  end if;

  -- O unico UPDATE tolerado e o ON DELETE SET NULL que o proprio Postgres
  -- aplica quando o produto, o pedido ou o usuario apontado deixa de
  -- existir. Os numeros do lancamento seguem intocaveis: quem tentar
  -- reescrever quantidade, saldo, tipo, motivo ou data leva excecao.
  if new.id               is distinct from old.id
     or new.product_slug    is distinct from old.product_slug
     or new.movement_type   is distinct from old.movement_type
     or new.quantity_change is distinct from old.quantity_change
     or new.quantity_before is distinct from old.quantity_before
     or new.quantity_after  is distinct from old.quantity_after
     or new.reason          is distinct from old.reason
     or new.note            is distinct from old.note
     or new.supplier        is distinct from old.supplier
     or new.unit_cost_cents is distinct from old.unit_cost_cents
     or new.source          is distinct from old.source
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at      is distinct from old.created_at
     or (new.product_id    is not null and new.product_id    is distinct from old.product_id)
     or (new.order_id      is not null and new.order_id      is distinct from old.order_id)
     or (new.admin_user_id is not null and new.admin_user_id is distinct from old.admin_user_id) then
    raise exception 'inventory_movements_is_append_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_movements_append_only on public.inventory_movements;
create trigger inventory_movements_append_only
  before update or delete on public.inventory_movements
  for each row execute function public.block_inventory_movement_rewrite();

-- Helper unico usado por toda escrita de estoque do sistema.
create or replace function private.record_inventory_movement(
  p_product_slug text,
  p_movement_type text,
  p_quantity_change integer,
  p_quantity_before integer,
  p_quantity_after integer,
  p_source text default 'system',
  p_reason text default null,
  p_note text default null,
  p_order_id uuid default null,
  p_admin_user_id uuid default null,
  p_unit_cost_cents integer default null,
  p_supplier text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_product_id uuid;
begin
  select id into v_product_id from public.products where slug = p_product_slug;

  insert into public.inventory_movements (
    product_id, product_slug, movement_type, quantity_change,
    quantity_before, quantity_after, reason, note, supplier,
    unit_cost_cents, order_id, admin_user_id, source, idempotency_key
  ) values (
    v_product_id, p_product_slug, p_movement_type, p_quantity_change,
    p_quantity_before, p_quantity_after, p_reason, p_note, p_supplier,
    p_unit_cost_cents, p_order_id, p_admin_user_id, p_source, p_idempotency_key
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Lastro historico: o saldo que ja existia antes do livro-razao existir
-- entra como um unico lancamento de abertura por produto, para que a
-- soma das movimentacoes bata com o estoque atual desde o primeiro dia.
insert into public.inventory_movements (
  product_id, product_slug, movement_type, quantity_change,
  quantity_before, quantity_after, reason, source, created_at
)
select p.id, p.slug, 'saldo_inicial', p.stock_quantity, 0, p.stock_quantity,
       'Saldo existente na implantação do controle de estoque', 'migracao', now()
from public.products p
where not exists (
  select 1 from public.inventory_movements m
  where m.product_slug = p.slug and m.movement_type = 'saldo_inicial'
);

-- ---------------------------------------------------------------------
-- 5) ORDER_STATUS_HISTORY - linha do tempo do pedido
-- ---------------------------------------------------------------------
create table if not exists public.order_status_history (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  event_type    text not null,
  from_status   text,
  to_status     text,
  detail        jsonb,
  admin_user_id uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint order_status_history_event_length check (length(event_type) between 2 and 60),
  constraint order_status_history_detail_object
    check (detail is null or jsonb_typeof(detail) = 'object')
);

create index if not exists order_status_history_order_idx
  on public.order_status_history(order_id, created_at);

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, event_type, to_status, detail)
    values (new.id, 'pedido_criado', new.status,
            jsonb_build_object('total_cents', new.total_cents));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, event_type, from_status, to_status, detail)
    values (new.id, 'status_alterado', old.status, new.status,
            jsonb_strip_nulls(jsonb_build_object('payment_status', new.payment_status)));
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into public.order_status_history (order_id, event_type, detail)
    values (new.id, 'pagamento_atualizado',
            jsonb_strip_nulls(jsonb_build_object(
              'de', old.payment_status, 'para', new.payment_status)));
  end if;

  if new.tracking_code is distinct from old.tracking_code then
    insert into public.order_status_history (order_id, event_type, detail)
    values (new.id,
            case when old.tracking_code is null then 'rastreio_adicionado'
                 else 'rastreio_alterado' end,
            jsonb_strip_nulls(jsonb_build_object(
              'de', old.tracking_code, 'para', new.tracking_code)));
  end if;

  if new.stock_consumed_at is distinct from old.stock_consumed_at
     and new.stock_consumed_at is not null then
    insert into public.order_status_history (order_id, event_type, detail)
    values (new.id, 'estoque_baixado',
            jsonb_build_object('inventory_shortfall', new.inventory_shortfall));
  end if;

  if new.stock_released_at is distinct from old.stock_released_at
     and new.stock_released_at is not null then
    insert into public.order_status_history (order_id, event_type, detail)
    values (new.id, 'estoque_devolvido', '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists orders_log_status_history on public.orders;
create trigger orders_log_status_history
  after insert or update on public.orders
  for each row execute function public.log_order_status_change();

-- Lastro para os pedidos que ja existiam antes da linha do tempo.
insert into public.order_status_history (order_id, event_type, to_status, detail, created_at)
select o.id, 'pedido_criado', o.status,
       jsonb_build_object('total_cents', o.total_cents), o.created_at
from public.orders o
where not exists (
  select 1 from public.order_status_history h where h.order_id = o.id
);

-- ---------------------------------------------------------------------
-- 6) ORDERS - campos de envio
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_carrier text,
  add column if not exists tracking_url     text,
  add column if not exists posted_at        timestamptz,
  add column if not exists delivered_at     timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_carrier_length' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_shipping_carrier_length
      check (shipping_carrier is null or length(shipping_carrier) <= 60) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_tracking_url_length' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_tracking_url_length
      check (tracking_url is null or length(tracking_url) <= 400) not valid;
  end if;
end $$;

create index if not exists orders_awaiting_shipment_idx
  on public.orders(paid_at) where status = 'paid';
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- Carimba as datas de postagem e entrega quando o status muda, para o
-- painel nao depender da usuaria lembrar de preencher data.
create or replace function public.stamp_order_shipping_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    new.posted_at := coalesce(new.posted_at, now());
  end if;
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_shipping_dates on public.orders;
create trigger orders_stamp_shipping_dates
  before update of status on public.orders
  for each row execute function public.stamp_order_shipping_dates();

-- ---------------------------------------------------------------------
-- 7) Estoque: reserva, liberacao e consumo agora alimentam o livro-razao
--
-- As tres funcoes abaixo mantem exatamente a mesma logica de negocio de
-- db/security-final-hardening.sql. A unica mudanca e o registro da
-- movimentacao e, no create_reserved_order, o uso do preco promocional
-- vigente. Nenhuma trava de concorrencia foi afrouxada.
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
  v_before integer;
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
    select stock_quantity into v_before
    from public.products
    where slug = v_item.product_slug
    for update;

    if found then
      update public.products
      set stock_quantity = stock_quantity + v_item.qty
      where slug = v_item.product_slug;

      perform private.record_inventory_movement(
        v_item.product_slug, 'liberacao_reserva', v_item.qty,
        v_before, v_before + v_item.qty, 'system',
        'Reserva liberada (pedido não concluído)', null, p_order_id
      );
    end if;
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
  v_taken integer;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.stock_consumed_at is not null then
    return false;
  end if;

  -- Reserva ainda ativa: a quantidade ja foi decrementada na criacao.
  -- Registra a venda como movimentacao de saldo zero sobre o disponivel,
  -- porque a baixa fisica ocorreu no momento da reserva.
  if v_order.stock_reserved and v_order.stock_released_at is null then
    for v_item in
      select product_slug, sum(qty)::integer as qty
      from public.order_items
      where order_id = p_order_id
      group by product_slug
      order by product_slug
    loop
      select stock_quantity into v_available
      from public.products
      where slug = v_item.product_slug;

      if found then
        perform private.record_inventory_movement(
          v_item.product_slug, 'venda', 0, v_available, v_available, 'webhook',
          'Venda confirmada (baixa já aplicada na reserva)', null, p_order_id
        );
      end if;
    end loop;

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
      v_taken := least(v_available, v_item.qty);
      update public.products
      set stock_quantity = greatest(0, stock_quantity - v_item.qty)
      where slug = v_item.product_slug;

      perform private.record_inventory_movement(
        v_item.product_slug, 'venda', -v_taken,
        v_available, v_available - v_taken, 'webhook',
        case when v_available < v_item.qty
             then 'Venda confirmada sem reserva — estoque insuficiente'
             else 'Venda confirmada sem reserva ativa' end,
        null, p_order_id
      );
    end if;
  end loop;

  update public.orders
  set stock_consumed_at = now(),
      inventory_shortfall = inventory_shortfall or v_shortfall
  where id = p_order_id;

  return true;
end;
$$;

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
  v_qty integer;
  v_before integer;
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
    select p.id, p.slug, p.name, p.active, p.stock_quantity, requested.qty,
           public.effective_price_cents(
             p.price_cents, p.promo_price_cents,
             p.promo_starts_at, p.promo_ends_at
           ) as price_cents
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
      'qty', v_product.qty,
      'stock_before', v_product.stock_quantity
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

    v_qty := (v_raw->>'qty')::integer;
    v_before := (v_raw->>'stock_before')::integer;

    update public.products
    set stock_quantity = stock_quantity - v_qty
    where id = (v_raw->>'id')::uuid;

    perform private.record_inventory_movement(
      v_raw->>'slug', 'reserva', -v_qty, v_before, v_before - v_qty,
      'checkout', 'Reserva para pedido em pagamento', null, v_order_id
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_cents', v_total,
    'reservation_expires_at', v_reservation_expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Movimentacao manual de estoque (painel administrativo)
--
-- Um unico ponto de entrada, transacional, com trava por produto,
-- protecao contra estoque negativo e chave de idempotencia contra o
-- clique duplo em "Confirmar".
-- ---------------------------------------------------------------------
create or replace function public.admin_move_inventory(
  p_admin_user_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text default null,
  p_note text default null,
  p_unit_cost_cents integer default null,
  p_supplier text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_change integer;
  v_after integer;
  v_movement_id uuid;
  v_existing public.inventory_movements%rowtype;
begin
  if p_admin_user_id is null or p_product_id is null then
    raise exception 'invalid_movement_payload' using errcode = '22023';
  end if;

  if p_movement_type not in (
    'entrada', 'devolucao', 'troca', 'ajuste_positivo', 'ajuste_negativo',
    'perda', 'avaria', 'inventario'
  ) then
    raise exception 'movement_type_not_allowed' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 0 or p_quantity > 100000 then
    raise exception 'invalid_movement_quantity' using errcode = '22023';
  end if;

  if p_movement_type <> 'inventario' and p_quantity = 0 then
    raise exception 'invalid_movement_quantity' using errcode = '22023';
  end if;

  if not exists (select 1 from public.admins where user_id = p_admin_user_id) then
    raise exception 'not_an_admin' using errcode = '42501';
  end if;

  -- Replay do mesmo envio: devolve o resultado anterior sem mexer no
  -- estoque de novo.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.inventory_movements
    where idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'state', 'duplicate',
        'movement_id', v_existing.id,
        'quantity_after', v_existing.quantity_after
      );
    end if;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_change := case p_movement_type
    when 'entrada'          then p_quantity
    when 'devolucao'        then p_quantity
    when 'ajuste_positivo'  then p_quantity
    when 'troca'            then p_quantity
    when 'inventario'       then p_quantity - v_product.stock_quantity
    else -p_quantity
  end;

  v_after := v_product.stock_quantity + v_change;

  if v_after < 0 then
    raise exception 'insufficient_stock_for_movement' using errcode = 'P0001';
  end if;

  update public.products
  set stock_quantity = v_after,
      cost_cents = case
        when p_movement_type = 'entrada' and p_unit_cost_cents is not null
        then p_unit_cost_cents
        else cost_cents
      end
  where id = p_product_id;

  v_movement_id := private.record_inventory_movement(
    v_product.slug, p_movement_type, v_change,
    v_product.stock_quantity, v_after, 'admin',
    p_reason, p_note, null, p_admin_user_id,
    p_unit_cost_cents, p_supplier, p_idempotency_key
  );

  return jsonb_build_object(
    'state', 'applied',
    'movement_id', v_movement_id,
    'quantity_before', v_product.stock_quantity,
    'quantity_after', v_after
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8b) Gravacao do produto em uma unica transacao
--
-- Produto, galeria e saldo inicial mudam juntos ou nao mudam. Sem isto,
-- uma falha de rede no meio do salvamento deixaria o produto criado sem
-- foto, ou com estoque inicial contado duas vezes na tentativa seguinte.
--
-- O campo p_fields ja chega saneado pela Edge Function, mas as chaves
-- sao lidas uma a uma aqui tambem: o banco nunca faz `select * from
-- jsonb_populate_record`, entao nenhuma chave extra vira coluna.
-- ---------------------------------------------------------------------
create or replace function public.admin_save_product(
  p_admin_user_id uuid,
  p_product_id uuid,
  p_fields jsonb,
  p_images jsonb default '[]'::jsonb,
  p_initial_stock integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_is_new boolean := p_product_id is null;
  v_current_slug text;
  v_image jsonb;
  v_position integer := 0;
  v_stock integer := greatest(0, coalesce(p_initial_stock, 0));
begin
  if p_admin_user_id is null or p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'invalid_product_payload' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admins where user_id = p_admin_user_id) then
    raise exception 'not_an_admin' using errcode = '42501';
  end if;

  if v_is_new then
    insert into public.products (
      slug, name, sku, status, category_id, collection, tags,
      short_description, long_description, price_cents,
      compare_at_price_cents, promo_price_cents, promo_starts_at, promo_ends_at,
      cost_cents, min_stock, featured, attributes, seo_title, seo_description,
      stock_quantity
    ) values (
      p_fields->>'slug',
      p_fields->>'name',
      p_fields->>'sku',
      p_fields->>'status',
      nullif(p_fields->>'category_id', '')::uuid,
      p_fields->>'collection',
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_fields->'tags')),
        '{}'::text[]
      ),
      p_fields->>'short_description',
      p_fields->>'long_description',
      (p_fields->>'price_cents')::integer,
      nullif(p_fields->>'compare_at_price_cents', '')::integer,
      nullif(p_fields->>'promo_price_cents', '')::integer,
      nullif(p_fields->>'promo_starts_at', '')::timestamptz,
      nullif(p_fields->>'promo_ends_at', '')::timestamptz,
      nullif(p_fields->>'cost_cents', '')::integer,
      coalesce((p_fields->>'min_stock')::integer, 0),
      coalesce((p_fields->>'featured')::boolean, false),
      coalesce(p_fields->'attributes', '{}'::jsonb),
      p_fields->>'seo_title',
      p_fields->>'seo_description',
      v_stock
    )
    returning id into v_id;

    if v_stock > 0 then
      perform private.record_inventory_movement(
        p_fields->>'slug', 'entrada', v_stock, 0, v_stock, 'admin',
        'Estoque informado no cadastro do produto', null, null, p_admin_user_id
      );
    end if;
  else
    v_id := p_product_id;

    -- O slug e a chave de venda: order_items guarda o slug, e a devolucao
    -- de reserva procura o produto por ele. Trocar o slug de uma peca que
    -- ja foi vendida quebraria esse vinculo silenciosamente, entao a troca
    -- so e permitida enquanto ninguem comprou.
    select slug into v_current_slug from public.products where id = v_id;
    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    if v_current_slug is distinct from (p_fields->>'slug')
       and exists (select 1 from public.order_items where product_slug = v_current_slug) then
      raise exception 'slug_locked_by_orders' using errcode = 'P0001';
    end if;

    -- stock_quantity fica de fora de proposito: saldo so muda por
    -- movimentacao registrada, nunca por edicao de ficha.
    update public.products set
      slug                   = p_fields->>'slug',
      name                   = p_fields->>'name',
      sku                    = p_fields->>'sku',
      status                 = p_fields->>'status',
      category_id            = nullif(p_fields->>'category_id', '')::uuid,
      collection             = p_fields->>'collection',
      tags                   = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_fields->'tags')),
        '{}'::text[]
      ),
      short_description      = p_fields->>'short_description',
      long_description       = p_fields->>'long_description',
      price_cents            = (p_fields->>'price_cents')::integer,
      compare_at_price_cents = nullif(p_fields->>'compare_at_price_cents', '')::integer,
      promo_price_cents      = nullif(p_fields->>'promo_price_cents', '')::integer,
      promo_starts_at        = nullif(p_fields->>'promo_starts_at', '')::timestamptz,
      promo_ends_at          = nullif(p_fields->>'promo_ends_at', '')::timestamptz,
      cost_cents             = nullif(p_fields->>'cost_cents', '')::integer,
      min_stock              = coalesce((p_fields->>'min_stock')::integer, 0),
      featured               = coalesce((p_fields->>'featured')::boolean, false),
      attributes             = coalesce(p_fields->'attributes', '{}'::jsonb),
      seo_title              = p_fields->>'seo_title',
      seo_description        = p_fields->>'seo_description'
    where id = v_id;

    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;

  -- Galeria: substitui o conjunto inteiro. Como tudo acontece dentro da
  -- mesma transacao, nao existe janela em que o produto fique sem foto.
  if p_images is not null and jsonb_typeof(p_images) = 'array' then
    delete from public.product_images where product_id = v_id;

    for v_image in select value from jsonb_array_elements(p_images)
    loop
      insert into public.product_images (product_id, url, alt, position, is_primary)
      values (
        v_id,
        v_image->>'url',
        nullif(v_image->>'alt', ''),
        v_position,
        coalesce((v_image->>'is_primary')::boolean, false)
      );
      v_position := v_position + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'created', v_is_new,
    'slug', p_fields->>'slug'
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9) Leituras agregadas para o painel
-- ---------------------------------------------------------------------

-- Disponivel / reservado / fisico por produto. O reservado sai dos
-- pedidos com reserva viva, nunca de uma coluna espelhada.
create or replace function public.product_stock_snapshot()
returns table (
  slug        text,
  available   integer,
  reserved    integer,
  physical    integer,
  min_stock   integer,
  low_stock   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug,
         p.stock_quantity,
         coalesce(r.reserved, 0)::integer,
         (p.stock_quantity + coalesce(r.reserved, 0))::integer,
         p.min_stock,
         (p.status = 'active' and p.stock_quantity <= p.min_stock)
  from public.products p
  left join (
    select oi.product_slug, sum(oi.qty)::integer as reserved
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.stock_reserved
      and o.stock_released_at is null
      and o.stock_consumed_at is null
    group by oi.product_slug
  ) r on r.product_slug = p.slug;
$$;

-- Indicadores da tela "Visão geral". Uma unica ida ao banco em vez de
-- uma dezena de contagens separadas.
create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'produtos', (
      select jsonb_build_object(
        'ativos',       count(*) filter (where status = 'active'),
        'inativos',     count(*) filter (where status = 'inactive'),
        'arquivados',   count(*) filter (where status = 'archived'),
        'sem_estoque',  count(*) filter (where status = 'active' and stock_quantity = 0),
        'estoque_baixo',count(*) filter (
          where status = 'active' and stock_quantity > 0 and stock_quantity <= min_stock
        ),
        'itens_em_estoque', coalesce(sum(stock_quantity) filter (where status <> 'archived'), 0)
      )
      from public.products
    ),
    'pedidos', (
      select jsonb_build_object(
        'aguardando_pagamento', count(*) filter (where status in ('pending', 'processing')),
        'pagos',                count(*) filter (where status = 'paid'),
        'aguardando_envio',     count(*) filter (where status = 'paid'),
        'enviados',             count(*) filter (where status = 'shipped'),
        'entregues',            count(*) filter (where status = 'delivered'),
        'cancelados',           count(*) filter (where status = 'canceled'),
        'estornados',           count(*) filter (where status = 'refunded'),
        'novos_24h',            count(*) filter (where created_at >= now() - interval '24 hours'),
        'sem_rastreio',         count(*) filter (where status = 'paid' and tracking_code is null)
      )
      from public.orders
    ),
    'vendas', (
      select jsonb_build_object(
        'hoje_cents', coalesce(sum(total_cents) filter (
          where (paid_at at time zone 'America/Sao_Paulo')::date
                = (now() at time zone 'America/Sao_Paulo')::date), 0),
        'semana_cents', coalesce(sum(total_cents) filter (
          where paid_at >= now() - interval '7 days'), 0),
        'mes_cents', coalesce(sum(total_cents) filter (
          where paid_at >= now() - interval '30 days'), 0),
        'total_cents', coalesce(sum(total_cents), 0),
        'pedidos_pagos', count(*)
      )
      from public.orders
      where paid_at is not null
        and status in ('paid', 'shipped', 'delivered')
    ),
    'itens_vendidos', (
      select coalesce(sum(oi.qty), 0)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.status in ('paid', 'shipped', 'delivered')
    ),
    'alertas', (
      select jsonb_build_object(
        'pedidos_com_falta_de_estoque', count(*) filter (where inventory_shortfall)
      )
      from public.orders
    )
  );
$$;

-- Busca de pedido pelo numero curto que o painel exibe (os 8 primeiros
-- caracteres do id). `ilike` nao funciona sobre uuid, e converter a coluna
-- inteira no filtro impediria o uso de indice; aqui a conversao acontece
-- uma vez, dentro de uma funcao com limite fixo de resultado.
create or replace function public.admin_find_order_ids(p_prefix text)
returns table (order_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
begin
  if v_prefix !~ '^[0-9a-f-]{4,36}$' then
    return;
  end if;

  return query
    select o.id
    from public.orders o
    where o.id::text like v_prefix || '%'
    order by o.created_at desc
    limit 100;
end;
$$;

-- Resolve um termo de busca (nome, e-mail ou telefone) na lista de
-- usuarios correspondentes. O e-mail mora em auth.users, fora do alcance
-- do PostgREST; sem esta funcao a busca de pedidos por e-mail so
-- conseguiria filtrar a pagina ja carregada, em vez do banco inteiro.
create or replace function public.admin_find_user_ids(p_term text)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term text := btrim(coalesce(p_term, ''));
  v_digits text;
  v_pattern text;
begin
  if length(v_term) < 2 then
    return;
  end if;

  -- `like` trata _ e % como curinga: escapa antes de montar o padrao,
  -- senao uma busca por "a%" varre a base inteira.
  v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits := regexp_replace(v_term, '[^0-9]', '', 'g');

  return query
    select u.id
    from auth.users u
    where u.email ilike v_pattern escape '\'
    union
    select p.id
    from public.profiles p
    where p.full_name ilike v_pattern escape '\'
       or (
         length(v_digits) >= 4
         and regexp_replace(p.phone, '[^0-9]', '', 'g') like '%' || v_digits || '%'
       )
    limit 200;
end;
$$;

-- Clientes agregados a partir dos pedidos reais. Nao cria cadastro novo
-- nem cruza dado de outra origem: e a mesma informacao que o pedido ja
-- carrega, agrupada por pessoa.
create or replace function public.admin_customer_summary(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  user_id        uuid,
  full_name      text,
  phone          text,
  orders_count   bigint,
  paid_count     bigint,
  total_cents    bigint,
  first_order_at timestamptz,
  last_order_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id,
         p.full_name,
         p.phone,
         count(*),
         count(*) filter (where o.status in ('paid', 'shipped', 'delivered')),
         coalesce(sum(o.total_cents) filter (
           where o.status in ('paid', 'shipped', 'delivered')), 0),
         min(o.created_at),
         max(o.created_at)
  from public.orders o
  left join public.profiles p on p.id = o.user_id
  group by o.user_id, p.full_name, p.phone
  order by max(o.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ---------------------------------------------------------------------
-- 10) RLS, privilegios e politicas das tabelas novas
--
-- Regra da casa (herdada de security-final-hardening.sql): o navegador
-- so le o que a vitrine precisa; toda escrita administrativa passa pela
-- service_role dentro das Edge Functions, depois de confirmar admin+2FA.
-- ---------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.order_status_history enable row level security;

revoke all on public.categories from anon, authenticated;
revoke all on public.product_images from anon, authenticated;
revoke all on public.inventory_movements from anon, authenticated;
revoke all on public.order_status_history from anon, authenticated;

grant select on public.categories to anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant all on public.categories to service_role;
grant all on public.product_images to service_role;
grant all on public.inventory_movements to service_role;
grant all on public.order_status_history to service_role;

-- A vitrine precisa das colunas novas do produto; o custo e a margem
-- ficam fora do que o navegador consegue ler.
revoke select on public.products from anon, authenticated;
grant select (
  id, slug, name, category, category_id, collection, tags, sku,
  price_cents, compare_at_price_cents, promo_price_cents,
  promo_starts_at, promo_ends_at,
  active, in_stock, stock_quantity, featured, status,
  short_description, long_description, attributes,
  seo_title, seo_description, min_stock, low_stock, created_at, updated_at
) on public.products to anon, authenticated;

drop policy if exists "categories_select_active" on public.categories;
create policy "categories_select_active"
  on public.categories for select to anon, authenticated
  using (active = true);

drop policy if exists "product_images_select_active_product" on public.product_images;
create policy "product_images_select_active_product"
  on public.product_images for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id and p.active = true
    )
  );

-- Sem policy em inventory_movements e order_status_history: movimentacao
-- de estoque e linha do tempo interna nao saem do painel.

-- Este arquivo cria funcoes depois do hardening base. Reaplicar o bloqueio
-- aqui evita depender da ordem historica das migrations ou do owner usado.
revoke execute on all functions in schema public
  from public, anon, authenticated;
revoke execute on all functions in schema private
  from public, anon, authenticated;
alter default privileges
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

grant execute on function public.effective_price_cents(integer, integer, timestamptz, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.create_reserved_order(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.admin_move_inventory(
  uuid, uuid, text, integer, text, text, integer, text, text
) to service_role;
grant execute on function public.admin_save_product(uuid, uuid, jsonb, jsonb, integer)
  to service_role;
grant execute on function public.product_stock_snapshot() to service_role;
grant execute on function public.admin_dashboard_metrics() to service_role;
grant execute on function public.admin_customer_summary(integer, integer) to service_role;
grant execute on function public.admin_find_user_ids(text) to service_role;
grant execute on function public.admin_find_order_ids(text) to service_role;

-- ---------------------------------------------------------------------
-- 11) Armazenamento das fotos dos produtos
--
-- Bucket publico para leitura (a vitrine precisa exibir), escrita so
-- para quem esta em public.admins. O upload sai direto do navegador da
-- administradora com o JWT dela, sem passar a service_role para o
-- cliente.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

commit;

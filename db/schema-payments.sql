-- =====================================================================
-- DRUZA SEMI JOIAS — schema-payments.sql
-- Adições à tabela orders para suportar pagamentos via MercadoPago.
-- Rodar APÓS schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas extras para o gateway (MercadoPago)
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id    text,
  add column if not exists payment_status   text;   -- approved/pending/rejected/refunded

create index if not exists orders_mp_preference_id_idx on public.orders(mp_preference_id);

-- ---------------------------------------------------------------------
-- Política: usuário cria seu próprio pedido em status 'pending'
--
-- Importante: a Edge Function 'create-preference' chama esta API usando
-- o JWT do usuário (auth.uid()). Só permitimos INSERT se o user_id bate
-- com o do JWT E o status inicial é 'pending'. Promoção para 'paid' só
-- acontece via service_role no webhook.
-- ---------------------------------------------------------------------
drop policy if exists "orders_insert_own_pending" on public.orders;
create policy "orders_insert_own_pending"
  on public.orders for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
  );

-- ---------------------------------------------------------------------
-- Política: usuário insere itens nos próprios pedidos
-- ---------------------------------------------------------------------
drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = auth.uid()
    )
  );

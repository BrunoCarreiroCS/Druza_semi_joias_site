-- =====================================================================
-- DRUZA - rollback operacional emergencial da migracao de 17/07/2026
--
-- ATENCAO: este rollback reabre o fluxo legado de INSERT direto em
-- orders/order_items. Use apenas para recuperar o checkout enquanto a
-- versao anterior das Edge Functions e restaurada. Nao remove colunas,
-- tabelas ou dados criados pela migracao de seguranca.
-- =====================================================================

begin;

do $$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_job_id
    from cron.job
    where jobname = 'druza-reconcile-stale-payments';
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  end if;
end $$;

-- Desativa somente triggers que podem impedir a Edge Function antiga.
drop trigger if exists orders_enforce_status_transition on public.orders;
drop trigger if exists orders_enforce_profile_requirements on public.orders;
drop function if exists private.enforce_order_profile_requirements();
drop function if exists private.profile_is_complete(uuid);

-- O fluxo antigo conhece apenas estes estados. Linhas processing sao
-- devolvidas a pending; os estados financeiros nunca sao rebaixados.
update public.orders
set status = 'pending',
    processing_started_at = null
where status = 'processing';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending','paid','shipped','delivered','canceled','refunded'));

-- Restaura as politicas legadas com escopo autenticado (nao public).
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "orders_insert_own_pending" on public.orders;
create policy "orders_insert_own_pending"
  on public.orders for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own"
  on public.order_items for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

grant insert on public.orders to authenticated;
grant insert on public.order_items to authenticated;

commit;

-- Depois do rollback:
-- 1. restaure as versoes das Edge Functions listadas no snapshot;
-- 2. teste login, criacao do pedido e pagamento em ambiente TEST;
-- 3. trate a causa e reaplique db/security-final-hardening.sql.

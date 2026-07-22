-- P0: fecha a execucao direta de funcoes privilegiadas pelo Data API.
--
-- Este script consulta apenas catalogos do PostgreSQL. Ele nao chama RPCs e
-- nao le tabelas de negocio.

begin;

-- A conexao gerenciada executa como postgres. Se qualquer outro owner tiver
-- objetos do app em public/private, a migracao deve parar para revisao manual.
do $p0_owner_guard$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname in ('public', 'private')
      and r.rolname <> 'postgres'
  ) or exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = c.relowner
    where n.nspname in ('public', 'private')
      and c.relkind in ('r', 'p', 'v', 'm', 'S')
      and r.rolname <> 'postgres'
  ) then
    raise exception 'p0_requires_unexpected_owner_review';
  end if;
end
$p0_owner_guard$;

-- Fecha a superficie existente. Grants explicitos do service_role sao
-- preservados; o acesso herdado de PUBLIC e removido e a allowlist e
-- reiterada abaixo.
revoke execute on all functions in schema public
  from public, anon, authenticated;
revoke execute on all functions in schema private
  from public, anon, authenticated;

-- Novos objetos do owner ativo nascem fechados e exigem GRANT explicito.
-- O REVOKE global e obrigatorio: o default nativo do PostgreSQL concede
-- EXECUTE de novas funcoes a PUBLIC, e um REVOKE por schema nao o remove.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

-- Em projetos hospedados atuais, objetos do app pertencem a postgres. O bloco
-- abaixo tambem fecha o owner legado quando a sessao autorizada puder assumi-lo.
-- Na conexao gerenciada atual ele emite apenas um NOTICE, sem elevar privilegios.
do $p0_legacy_defaults$
begin
  if pg_has_role(current_user, 'supabase_admin', 'USAGE') then
    execute 'alter default privileges for role supabase_admin
      revoke execute on functions from public, anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema public
      revoke all on tables from public, anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema public
      revoke all on sequences from public, anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema public
      revoke execute on functions from public, anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema private
      revoke execute on functions from public, anon, authenticated, service_role';
  else
    raise notice 'p0_supabase_admin_default_acl_requires_owner_context';
  end if;
end
$p0_legacy_defaults$;

-- Checkout, pagamentos e reconciliacao: somente Edge Functions com secret key.
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

-- Catalogo e painel: somente Edge Functions depois de admin + AAL2.
grant execute on function public.admin_move_inventory(
  uuid, uuid, text, integer, text, text, integer, text, text
) to service_role;
grant execute on function public.admin_save_product(
  uuid, uuid, jsonb, jsonb, integer
) to service_role;
grant execute on function public.product_stock_snapshot() to service_role;
grant execute on function public.admin_dashboard_metrics() to service_role;
grant execute on function public.admin_customer_summary(integer, integer)
  to service_role;
grant execute on function public.admin_find_user_ids(text) to service_role;
grant execute on function public.admin_find_order_ids(text) to service_role;

-- Compatibilidade aprovada: funcao pura de preco, sem SECURITY DEFINER.
grant execute on function public.effective_price_cents(
  integer, integer, timestamptz, timestamptz
) to anon, authenticated, service_role;

-- Pos-condicao critica: a propria migracao falha antes do COMMIT se qualquer
-- SECURITY DEFINER de public ainda estiver ao alcance direto de clientes.
do $p0_assert$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'p0_security_definer_still_client_executable';
  end if;
end
$p0_assert$;

notify pgrst, 'reload schema';

commit;

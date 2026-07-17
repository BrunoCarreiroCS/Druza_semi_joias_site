-- =====================================================================
-- DRUZA - bloqueio de checkout para perfis legados incompletos
-- Data: 17/07/2026
--
-- Nao altera nem remove dados existentes. Novos pedidos so podem ser
-- criados depois que o titular informar nome, telefone valido e nascimento.
-- =====================================================================

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

revoke execute on function private.profile_is_complete(uuid)
  from public, anon, authenticated;
revoke execute on function private.current_brazil_date()
  from public, anon, authenticated;
revoke execute on function private.enforce_order_profile_requirements()
  from public, anon, authenticated;

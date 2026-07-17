-- =====================================================================
-- DRUZA - data legal brasileira para validacao de maioridade
-- Data: 17/07/2026
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

revoke execute on function private.current_brazil_date()
  from public, anon, authenticated;
revoke execute on function private.profile_is_complete(uuid)
  from public, anon, authenticated;
revoke execute on function public.enforce_profile_requirements()
  from public, anon, authenticated;

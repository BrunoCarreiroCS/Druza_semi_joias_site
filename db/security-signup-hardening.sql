-- =====================================================================
-- DRUZA - endurecimento de cadastro para banco Supabase existente
--
-- Rode este arquivo no SQL Editor se o banco ja foi criado antes desta
-- atualizacao. Ele preserva usuarios antigos, mas passa a exigir dados
-- seguros em novos cadastros e proximas atualizacoes de perfil.
-- =====================================================================

alter table public.profiles
  add column if not exists birth_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_full_name_required'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_full_name_required
      check (full_name is not null and length(btrim(full_name)) >= 3)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_phone_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_phone_format
      check (phone is not null and phone ~ '^\+55[1-9][1-9][0-9]{8,9}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_birth_date_age'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_birth_date_age
      check (birth_date is not null and birth_date <= (current_date - interval '18 years')::date)
      not valid;
  end if;
end $$;

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

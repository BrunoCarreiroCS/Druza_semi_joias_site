-- Executar depois de db/security-p1-product-images-listing.sql.
--
-- Teste exclusivo de metadados. Nao consulta storage.objects, nao lista
-- arquivos e termina em ROLLBACK.

begin;

do $p1_product_images_smoke$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_public_read'
  ) then
    raise exception 'p1_smoke_public_listing_policy_exists';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'product-images'
      and public
      and file_size_limit = 5242880
      and allowed_mime_types @> array[
        'image/jpeg', 'image/png', 'image/webp', 'image/avif'
      ]::text[]
  ) then
    raise exception 'p1_smoke_bucket_settings_changed';
  end if;

  if exists (
    select 1
    from (
      values
        ('product_images_admin_insert', 'INSERT'),
        ('product_images_admin_update', 'UPDATE'),
        ('product_images_admin_delete', 'DELETE')
    ) as expected(policyname, cmd)
    left join pg_policies p
      on p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = expected.policyname
    where p.policyname is null
      or p.cmd <> expected.cmd
      or p.roles <> array['authenticated']::name[]
      or case
        when expected.cmd = 'INSERT' then
          p.with_check is null
          or p.with_check not like '%product-images%'
          or p.with_check not like '%admins%'
          or p.with_check not like '%auth.uid%'
        else
          p.qual is null
          or p.qual not like '%product-images%'
          or p.qual not like '%admins%'
          or p.qual not like '%auth.uid%'
      end
  ) then
    raise exception 'p1_smoke_admin_write_policy_changed';
  end if;

  raise notice 'P1 product-images listing smoke test: OK';
end
$p1_product_images_smoke$;

rollback;

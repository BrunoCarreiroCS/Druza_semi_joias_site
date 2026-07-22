-- P1: impede a enumeracao ampla do bucket publico product-images.
--
-- O bucket permanece publico para servir URLs conhecidas. Este script altera
-- apenas metadados de autorizacao; nao lista nem le objetos armazenados.

begin;

drop policy if exists "product_images_public_read" on storage.objects;

-- Falha antes do COMMIT se a policy alvo ainda existir.
do $p1_product_images_assert$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_public_read'
  ) then
    raise exception 'p1_product_images_public_read_still_exists';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'product-images'
      and public
  ) then
    raise exception 'p1_product_images_public_bucket_missing';
  end if;
end
$p1_product_images_assert$;

commit;

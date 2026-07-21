// Cria ou edita um produto. A validacao vive em _shared/catalog-validation
// e a gravacao inteira (ficha + galeria + saldo inicial) acontece numa
// unica transacao dentro de public.admin_save_product.
//
// O saldo de estoque so pode ser informado na CRIACAO. Depois disso ele
// muda exclusivamente por movimentacao registrada, para que a soma do
// livro-razao sempre bata com o estoque atual.

import { AdminRequestError, logAdminAction, serveAdmin } from '../_shared/admin-endpoint.ts';
import {
  isUuid,
  parseImages,
  parseInitialStock,
  parseProductInput,
} from '../_shared/catalog-validation.ts';
import { SUPABASE_URL } from '../_shared/supabase-env.ts';

interface RequestBody extends Record<string, unknown> {
  id?: string;
  images?: unknown;
  initial_stock?: unknown;
}

function storageHost(): string {
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return '';
  }
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  if (body.id !== undefined && body.id !== null && !isUuid(body.id)) {
    throw new AdminRequestError('Produto inválido.');
  }
  const productId = isUuid(body.id) ? body.id : null;

  const fields = parseProductInput(body);
  const images = parseImages(body.images, storageHost());
  const initialStock = productId ? 0 : parseInitialStock(body.initial_stock);

  if (fields.category_id) {
    const { data: category } = await context.admin
      .from('categories').select('id').eq('id', fields.category_id).maybeSingle();
    if (!category) throw new AdminRequestError('A categoria escolhida não existe mais.');
  }

  const { data, error } = await context.admin.rpc('admin_save_product', {
    p_admin_user_id: context.userId,
    p_product_id: productId,
    p_fields: fields,
    p_images: images,
    p_initial_stock: initialStock,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('products_slug_key') || message.includes('duplicate key')) {
      if (message.includes('sku')) {
        throw new AdminRequestError('Já existe um produto com esse código interno (SKU).', 409);
      }
      throw new AdminRequestError('Já existe um produto com esse endereço no site.', 409);
    }
    if (message.includes('product_not_found')) {
      throw new AdminRequestError('Produto não encontrado.', 404);
    }
    if (message.includes('slug_locked_by_orders')) {
      throw new AdminRequestError(
        'Este produto já foi vendido, então o endereço dele no site não pode mais mudar. '
        + 'Você pode alterar todo o resto normalmente.',
        409,
      );
    }
    throw new Error(`save_product_failed: ${message}`);
  }

  const saved = (data ?? {}) as Record<string, unknown>;

  await logAdminAction(
    context.admin,
    context.userId,
    productId ? 'product.update' : 'product.create',
    'products',
    String(saved.id ?? productId ?? ''),
    {
      slug: fields.slug,
      status: fields.status,
      price_cents: fields.price_cents,
      images: images.length,
      initial_stock: initialStock || undefined,
    },
  );

  const { data: product } = await context.admin
    .from('products')
    .select('*, categories(id, slug, name), product_images(id, url, alt, position, is_primary)')
    .eq('id', saved.id)
    .maybeSingle();

  return { product, created: saved.created === true };
}, { limit: 40, maxBodyBytes: 96_000 });

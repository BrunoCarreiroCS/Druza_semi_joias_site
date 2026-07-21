// Remove uma categoria — mas nunca deixando produto orfao no caminho.
//
// Se ainda houver produtos vinculados, a exclusao e recusada com a
// contagem, para o painel poder oferecer as saidas: mover os produtos
// para outra categoria, apenas desativar, ou cancelar.

import { AdminRequestError, logAdminAction, serveAdmin } from '../_shared/admin-endpoint.ts';
import { isUuid } from '../_shared/catalog-validation.ts';

interface RequestBody {
  id?: string;
  /** Para onde mandar os produtos antes de excluir. */
  move_to_category_id?: string | null;
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  if (!isUuid(body.id)) throw new AdminRequestError('Categoria inválida.');

  const { data: category } = await context.admin
    .from('categories').select('id, name, slug').eq('id', body.id).maybeSingle();
  if (!category) throw new AdminRequestError('Categoria não encontrada.', 404);

  const { data: children } = await context.admin
    .from('categories').select('id').eq('parent_id', body.id).limit(1);
  if (children && children.length) {
    throw new AdminRequestError(
      'Esta categoria tem subcategorias. Remova ou mova as subcategorias antes.',
      409,
    );
  }

  const moveTo = body.move_to_category_id;
  if (moveTo !== undefined && moveTo !== null && moveTo !== '') {
    if (!isUuid(moveTo)) throw new AdminRequestError('Categoria de destino inválida.');
    if (moveTo === body.id) throw new AdminRequestError('Escolha uma categoria de destino diferente.');

    const { data: target } = await context.admin
      .from('categories').select('id').eq('id', moveTo).maybeSingle();
    if (!target) throw new AdminRequestError('A categoria de destino não existe.');

    const { error: moveError } = await context.admin
      .from('products').update({ category_id: moveTo }).eq('category_id', body.id);
    if (moveError) throw new Error(`move_products_failed: ${moveError.message}`);
  }

  const { count } = await context.admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', body.id);

  if ((count ?? 0) > 0) {
    throw new AdminRequestError(
      `Esta categoria ainda tem ${count} produto${count === 1 ? '' : 's'}. `
      + 'Escolha para qual categoria mover esses produtos, ou apenas desative a categoria.',
      409,
    );
  }

  const { error } = await context.admin.from('categories').delete().eq('id', body.id);
  if (error) throw new Error(`delete_category_failed: ${error.message}`);

  await logAdminAction(
    context.admin,
    context.userId,
    'category.delete',
    'categories',
    String(body.id),
    { slug: category.slug, produtos_movidos_para: moveTo ?? null },
  );

  return { ok: true };
}, { limit: 20 });

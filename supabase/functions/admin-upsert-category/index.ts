// Cria ou edita uma categoria.

import { AdminRequestError, logAdminAction, serveAdmin } from '../_shared/admin-endpoint.ts';
import { isUuid, parseCategoryInput } from '../_shared/catalog-validation.ts';

interface RequestBody extends Record<string, unknown> {
  id?: string;
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  if (body.id !== undefined && body.id !== null && !isUuid(body.id)) {
    throw new AdminRequestError('Categoria inválida.');
  }
  const categoryId = isUuid(body.id) ? body.id : null;
  const fields = parseCategoryInput(body);

  if (fields.parent_id) {
    if (fields.parent_id === categoryId) {
      throw new AdminRequestError('Uma categoria não pode ser superior de si mesma.');
    }
    const { data: parent } = await context.admin
      .from('categories').select('id, parent_id').eq('id', fields.parent_id).maybeSingle();
    if (!parent) throw new AdminRequestError('A categoria superior escolhida não existe.');
    // Um nivel de hierarquia basta para uma loja de semijoias, e impede
    // que a arvore vire um ciclo que trava a listagem.
    if (parent.parent_id) {
      throw new AdminRequestError('A categoria superior escolhida já está dentro de outra categoria.');
    }
  }

  const result = categoryId
    ? await context.admin.from('categories').update(fields).eq('id', categoryId).select().maybeSingle()
    : await context.admin.from('categories').insert(fields).select().maybeSingle();

  if (result.error) {
    if (String(result.error.code) === '23505') {
      throw new AdminRequestError('Já existe uma categoria com esse endereço no site.', 409);
    }
    throw new Error(`save_category_failed: ${result.error.message}`);
  }
  if (!result.data) throw new AdminRequestError('Categoria não encontrada.', 404);

  await logAdminAction(
    context.admin,
    context.userId,
    categoryId ? 'category.update' : 'category.create',
    'categories',
    String(result.data.id),
    { slug: fields.slug, active: fields.active },
  );

  return { category: result.data };
}, { limit: 40 });

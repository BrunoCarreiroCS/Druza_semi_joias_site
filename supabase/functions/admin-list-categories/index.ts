// deno-lint-ignore-file no-explicit-any
// Lista as categorias com a contagem de produtos vinculados — o numero
// que a tela usa para avisar que uma categoria nao pode ser removida.

import { serveAdmin } from '../_shared/admin-endpoint.ts';

serveAdmin(async ({ context }) => {
  const [{ data: categories, error }, { data: products }] = await Promise.all([
    context.admin
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    context.admin
      .from('products')
      .select('category_id, status')
      .neq('status', 'archived'),
  ]);
  if (error) throw new Error(`list_categories_failed: ${error.message}`);

  const countById = new Map<string, number>();
  for (const product of ((products as any[]) ?? [])) {
    const key = product.category_id;
    if (!key) continue;
    countById.set(key, (countById.get(key) ?? 0) + 1);
  }

  return {
    categories: ((categories as any[]) ?? []).map((category) => ({
      ...category,
      products_count: countById.get(category.id) ?? 0,
    })),
  };
}, { limit: 90 });

// deno-lint-ignore-file no-explicit-any
// Lista o catalogo para o painel: filtros, ordenacao, paginacao e o
// retrato de estoque (disponivel / reservado / fisico) de cada peca.

import { AdminRequestError, serveAdmin } from '../_shared/admin-endpoint.ts';
import { isUuid, PRODUCT_STATUSES } from '../_shared/catalog-validation.ts';

interface RequestBody {
  search?: string;
  category_id?: string;
  collection?: string;
  status?: string;
  availability?: 'all' | 'in_stock' | 'out_of_stock' | 'low_stock';
  featured?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
}

const SORTS: Record<string, { column: string; ascending: boolean }> = {
  nome: { column: 'name', ascending: true },
  preco_menor: { column: 'price_cents', ascending: true },
  preco_maior: { column: 'price_cents', ascending: false },
  estoque_menor: { column: 'stock_quantity', ascending: true },
  estoque_maior: { column: 'stock_quantity', ascending: false },
  recentes: { column: 'created_at', ascending: false },
  antigos: { column: 'created_at', ascending: true },
};

// O termo entra numa expressao `or=(...)` do PostgREST, onde virgula e
// parentese sao sintaxe. Em vez de escapar, restringe o alfabeto: busca
// de catalogo nao precisa de pontuacao.
function safeSearchTerm(value: unknown): string {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .slice(0, 60);
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  const status = String(body.status ?? '').trim();
  if (status && !PRODUCT_STATUSES.includes(status as any)) {
    throw new AdminRequestError('Situação inválida.');
  }
  if (body.category_id && !isUuid(body.category_id)) {
    throw new AdminRequestError('Categoria inválida.');
  }

  const sortKey = String(body.sort ?? 'recentes');
  const sort = SORTS[sortKey];
  if (!sort) throw new AdminRequestError('Ordenação inválida.');

  const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 50), 1), 200);
  const offset = Math.max(Math.trunc(Number(body.offset) || 0), 0);

  let query = context.admin
    .from('products')
    .select(
      'id, slug, sku, name, status, active, featured, category, category_id, collection, tags,'
      + ' price_cents, promo_price_cents, promo_starts_at, promo_ends_at,'
      + ' compare_at_price_cents, cost_cents, stock_quantity, min_stock, low_stock,'
      + ' short_description, long_description, attributes, seo_title, seo_description,'
      + ' created_at, updated_at, archived_at,'
      + ' categories(id, slug, name),'
      + ' product_images(id, url, alt, position, is_primary)',
      { count: 'exact' },
    )
    .order(sort.column, { ascending: sort.ascending })
    .range(offset, offset + limit - 1);

  // Sem filtro explicito, arquivados ficam fora: eles existem para
  // preservar historico de pedidos, nao para poluir a lista do dia a dia.
  if (status) query = query.eq('status', status);
  else query = query.neq('status', 'archived');

  if (body.category_id) query = query.eq('category_id', body.category_id);
  if (body.featured === true) query = query.eq('featured', true);

  const collection = safeSearchTerm(body.collection);
  if (collection) query = query.eq('collection', collection);

  if (body.availability === 'in_stock') query = query.gt('stock_quantity', 0);
  else if (body.availability === 'out_of_stock') query = query.eq('stock_quantity', 0);
  else if (body.availability === 'low_stock') query = query.eq('low_stock', true);

  const search = safeSearchTerm(body.search);
  if (search) {
    query = query.or(
      `name.ilike.*${search}*,slug.ilike.*${search}*,sku.ilike.*${search}*`,
    );
  }

  const [{ data: products, error, count }, { data: snapshot }] = await Promise.all([
    query,
    context.admin.rpc('product_stock_snapshot'),
  ]);
  if (error) throw new Error(`list_products_failed: ${error.message}`);

  const stockBySlug = new Map<string, any>(
    ((snapshot as any[]) ?? []).map((row) => [String(row.slug), row]),
  );

  const result = (products ?? []).map((product: any) => {
    const stock = stockBySlug.get(String(product.slug));
    const images = ((product.product_images as any[]) ?? [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position));
    return {
      ...product,
      product_images: images,
      primary_image: images.find((image) => image.is_primary) ?? images[0] ?? null,
      stock: {
        available: stock?.available ?? product.stock_quantity ?? 0,
        reserved: stock?.reserved ?? 0,
        physical: stock?.physical ?? product.stock_quantity ?? 0,
        low_stock: Boolean(stock?.low_stock),
      },
    };
  });

  return { products: result, total: count ?? result.length, limit, offset };
}, { limit: 90 });

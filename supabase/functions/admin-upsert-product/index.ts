import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from '../_shared/require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';
import { isUuid } from '../_shared/payment.ts';

interface RequestBody {
  id?: string;
  slug?: string;
  name?: string;
  category?: string;
  price_cents?: number;
  active?: boolean;
  in_stock?: boolean;
  stock_quantity?: number;
  featured?: boolean;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const originError = rejectDisallowedOrigin(req);
  if (originError) return originError;
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao permitido.' }, 405);

  const limited = rateLimit(req, corsHeaders(req), { limit: 30 });
  if (limited) return limited;

  let context;
  try {
    context = await requireAdmin(req);
  } catch (error) {
    if (error instanceof AdminAuthError) return json(req, { error: error.message }, error.status);
    return json(req, { error: 'Erro de autorizacao.' }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'JSON invalido.' }, 400);
  }

  const slug = String(body.slug ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const category = String(body.category ?? '').trim().toLowerCase();
  const priceCents = Number(body.price_cents);
  const stockQuantity = body.stock_quantity === undefined
    ? (body.in_stock === false ? 0 : 1)
    : Number(body.stock_quantity);

  if (body.id !== undefined && !isUuid(body.id)) {
    return json(req, { error: 'id invalido.' }, 400);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) {
    return json(req, { error: 'Slug invalido.' }, 400);
  }
  if (name.length < 2 || name.length > 120) {
    return json(req, { error: 'Nome invalido.' }, 400);
  }
  if (category && (category.length > 40 || !/^[a-z0-9-]+$/.test(category))) {
    return json(req, { error: 'Categoria invalida.' }, 400);
  }
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
    return json(req, { error: 'Preco invalido.' }, 400);
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100_000) {
    return json(req, { error: 'Quantidade de estoque invalida.' }, 400);
  }

  const fields = {
    slug,
    name,
    category: category || null,
    price_cents: priceCents,
    active: body.active !== false,
    stock_quantity: stockQuantity,
    featured: body.featured === true,
  };
  const result = body.id
    ? await context.admin.from('products').update(fields).eq('id', body.id).select().single()
    : await context.admin.from('products').insert(fields).select().single();

  if (result.error) {
    if (String(result.error.code) === '23505') {
      return json(req, { error: 'Ja existe um produto com esse slug.' }, 409);
    }
    return json(req, { error: 'Falha ao salvar produto.' }, 500);
  }

  await logAdminAction(
    context.admin,
    context.userId,
    body.id ? 'product.update' : 'product.create',
    'products',
    result.data.id,
    { changed_fields: Object.keys(fields).sort() },
  );
  return json(req, { product: result.data });
});

// =====================================================================
// DRUZA — Edge Function: admin-upsert-product
//
// Cria ou edita um produto (campos operacionais: preço, ativo, estoque).
// Conteúdo rico (fotos, descrição, galeria) continua em js/catalog.js,
// editado via código — fora do escopo desta função de propósito. Só
// admins (ver _shared/require-admin.ts).
//
// Deploy:  supabase functions deploy admin-upsert-product
// =====================================================================

import { requireAdmin, logAdminAction, AdminAuthError } from '../_shared/require-admin.ts';
import { CORS } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface ReqBody {
  id?: string;
  slug?: string;
  name?: string;
  category?: string;
  price_cents?: number;
  active?: boolean;
  in_stock?: boolean;
  featured?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const limited = rateLimit(req, CORS, { limit: 30 });
  if (limited) return limited;

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) return json({ error: err.message }, err.status);
    return json({ error: 'Erro de autorização.' }, 500);
  }
  const { admin, userId } = ctx;

  let body: ReqBody;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }

  const slug = (body.slug || '').trim().toLowerCase();
  const name = (body.name || '').trim();
  const category = (body.category || '').trim().toLowerCase();
  const priceCents = Number(body.price_cents);

  if (!slug || !name) return json({ error: 'Slug e nome são obrigatórios.' }, 400);
  // Slug vira URL (produto.html?slug=...) e chave de correlação — formato
  // estrito fecha injeção de caracteres estranhos em links e no catálogo.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) {
    return json({ error: 'Slug inválido: use só letras minúsculas, números e hífens (ex.: anel-lua-prata).' }, 400);
  }
  if (name.length > 120) return json({ error: 'Nome muito longo (máximo 120 caracteres).' }, 400);
  if (category && (category.length > 40 || !/^[a-z0-9-]+$/.test(category))) {
    return json({ error: 'Categoria inválida: use só letras minúsculas, números e hífens.' }, 400);
  }
  // Teto de sanidade: R$ 1.000.000,00 — barra erro de digitação grosseiro.
  if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
    return json({ error: 'Preço inválido.' }, 400);
  }

  const fields = {
    slug,
    name,
    category: category || null,
    price_cents: Math.round(priceCents),
    active: body.active !== false,
    in_stock: body.in_stock !== false,
    featured: body.featured === true,
  };

  const result = body.id
    ? await admin.from('products').update(fields).eq('id', body.id).select().single()
    : await admin.from('products').insert(fields).select().single();

  const { data, error } = result;
  if (error) {
    if (String(error.code) === '23505') return json({ error: 'Já existe um produto com esse slug.' }, 409);
    return json({ error: 'Falha ao salvar produto.', detail: error.message }, 500);
  }

  await logAdminAction(admin, userId, body.id ? 'product.update' : 'product.create', 'products', data.id, fields);

  return json({ product: data });
});

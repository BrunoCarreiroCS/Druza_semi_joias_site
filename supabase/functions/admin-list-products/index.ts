// =====================================================================
// DRUZA — Edge Function: admin-list-products
//
// Lista todos os produtos (inclusive inativos — o cliente comum só vê
// produtos ativos, via RLS `products_select_active`). Só admins (ver
// _shared/require-admin.ts).
//
// Deploy:  supabase functions deploy admin-list-products
// =====================================================================

import { requireAdmin, AdminAuthError } from '../_shared/require-admin.ts';
import { CORS } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const limited = rateLimit(req, CORS, { limit: 60 });
  if (limited) return limited;

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) return json({ error: err.message }, err.status);
    return json({ error: 'Erro de autorização.' }, 500);
  }
  const { admin } = ctx;

  const { data, error } = await admin
    .from('products').select('*').order('created_at', { ascending: true });
  if (error) return json({ error: 'Falha ao listar produtos.', detail: error.message }, 500);

  return json({ products: data || [] });
});

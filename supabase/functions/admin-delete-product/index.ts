// =====================================================================
// DRUZA — Edge Function: admin-delete-product
//
// Exclui um produto. Seguro para o histórico: order_items guarda um
// snapshot (product_slug/product_name/unit_price_cents) e NÃO tem FK para
// products, então pedidos antigos continuam íntegros. Só admins.
//
// Deploy:  supabase functions deploy admin-delete-product
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

  let body: { id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }
  if (!body.id) return json({ error: 'id é obrigatório.' }, 400);

  const { error } = await admin.from('products').delete().eq('id', body.id);
  if (error) return json({ error: 'Falha ao excluir produto.', detail: error.message }, 500);

  await logAdminAction(admin, userId, 'product.delete', 'products', body.id, null);
  return json({ ok: true });
});

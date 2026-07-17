import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from '../_shared/require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';
import { isUuid } from '../_shared/payment.ts';

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

  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'JSON invalido.' }, 400);
  }
  if (!isUuid(body.id)) return json(req, { error: 'id invalido.' }, 400);

  // Desativar preserva a linha necessaria para devolver reservas existentes.
  const { data, error } = await context.admin
    .from('products')
    .update({ active: false, stock_quantity: 0 })
    .eq('id', body.id)
    .select('id')
    .maybeSingle();
  if (error || !data) return json(req, { error: 'Falha ao desativar produto.' }, 500);

  await logAdminAction(
    context.admin,
    context.userId,
    'product.deactivate',
    'products',
    body.id,
    null,
  );
  return json(req, { ok: true });
});

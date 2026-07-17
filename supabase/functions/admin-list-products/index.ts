import { AdminAuthError, requireAdmin } from '../_shared/require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

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

  const limited = rateLimit(req, corsHeaders(req), { limit: 60 });
  if (limited) return limited;

  let context;
  try {
    context = await requireAdmin(req);
  } catch (error) {
    if (error instanceof AdminAuthError) return json(req, { error: error.message }, error.status);
    return json(req, { error: 'Erro de autorizacao.' }, 500);
  }

  const { data, error } = await context.admin
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return json(req, { error: 'Falha ao listar produtos.' }, 500);
  return json(req, { products: data ?? [] });
});

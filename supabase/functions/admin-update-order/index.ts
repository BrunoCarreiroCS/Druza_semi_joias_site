import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from '../_shared/require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';
import { isUuid } from '../_shared/payment.ts';

interface RequestBody {
  order_id?: string;
  status?: string;
  tracking_code?: string;
  admin_notes?: string;
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
  if (!isUuid(body.order_id)) return json(req, { error: 'order_id invalido.' }, 400);
  if (body.status && !['shipped', 'delivered'].includes(body.status)) {
    return json(req, { error: 'Status financeiro nao pode ser alterado manualmente.' }, 400);
  }

  const fields: Record<string, unknown> = {};
  if (body.status) fields.status = body.status;
  if (typeof body.tracking_code === 'string') {
    fields.tracking_code = body.tracking_code.trim().slice(0, 60) || null;
  }
  if (typeof body.admin_notes === 'string') {
    fields.admin_notes = body.admin_notes.trim().slice(0, 2000) || null;
  }
  if (Object.keys(fields).length === 0) {
    return json(req, { error: 'Nada para atualizar.' }, 400);
  }

  const { data, error } = await context.admin
    .from('orders')
    .update(fields)
    .eq('id', body.order_id)
    .select('*, order_items(*)')
    .single();
  if (error || !data) {
    const invalidTransition = error?.message?.includes('invalid_order_status_transition');
    return json(req, {
      error: invalidTransition
        ? 'Transicao de status nao permitida.'
        : 'Falha ao atualizar pedido.',
    }, invalidTransition ? 409 : 500);
  }

  await logAdminAction(
    context.admin,
    context.userId,
    'order.update',
    'orders',
    body.order_id,
    {
      changed_fields: Object.keys(fields).sort(),
      status: fields.status ?? null,
    },
  );
  return json(req, { order: data });
});

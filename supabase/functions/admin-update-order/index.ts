// =====================================================================
// DRUZA — Edge Function: admin-update-order
//
// Atualiza status e/ou código de rastreio de um pedido. Só admins (ver
// _shared/require-admin.ts). NÃO dispara reembolso/cobrança real no
// MercadoPago — só atualiza o registro interno do pedido. Estorno de
// dinheiro de fato continua sendo feito direto no painel do MercadoPago
// (de propósito: automatizar isso é um raio de ação maior, fica pra uma
// etapa futura se fizer falta).
//
// Deploy:  supabase functions deploy admin-update-order
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

// Mesma lista do check constraint em public.orders.status — validar
// aqui também é só uma camada extra (defesa em profundidade), o banco
// rejeitaria de qualquer forma um valor fora dessa lista.
const ALLOWED_STATUS = ['pending', 'paid', 'shipped', 'delivered', 'canceled', 'refunded'];

interface ReqBody {
  order_id?: string;
  status?: string;
  tracking_code?: string;
  admin_notes?: string;
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

  if (!body.order_id) return json({ error: 'order_id é obrigatório.' }, 400);
  if (body.status && !ALLOWED_STATUS.includes(body.status)) {
    return json({ error: 'Status inválido.' }, 400);
  }

  const fields: Record<string, unknown> = {};
  if (body.status) fields.status = body.status;
  if (typeof body.tracking_code === 'string') fields.tracking_code = body.tracking_code.trim().slice(0, 60) || null;
  if (typeof body.admin_notes === 'string') fields.admin_notes = body.admin_notes.trim().slice(0, 2000) || null;
  if (Object.keys(fields).length === 0) return json({ error: 'Nada para atualizar.' }, 400);

  const { data, error } = await admin
    .from('orders').update(fields).eq('id', body.order_id).select('*, order_items(*)').single();
  if (error || !data) {
    return json({ error: 'Falha ao atualizar pedido.', detail: error?.message }, 500);
  }

  await logAdminAction(admin, userId, 'order.update', 'orders', body.order_id, fields);

  return json({ order: data });
});

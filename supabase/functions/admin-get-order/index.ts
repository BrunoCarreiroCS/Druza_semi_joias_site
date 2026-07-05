// =====================================================================
// DRUZA — Edge Function: admin-get-order
//
// Detalhe completo de UM pedido, para logística/envio: cliente
// (nome/e-mail/telefone), endereço de entrega completo, itens, e a forma
// de pagamento REAL usada (consultada ao vivo na API do MP pelo
// mp_payment_id). Só admins (ver _shared/require-admin.ts).
//
// Deploy:  supabase functions deploy admin-get-order
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { requireAdmin, AdminAuthError } from '../_shared/require-admin.ts';
import { CORS } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Rótulos amigáveis para o tipo de pagamento do MercadoPago.
const PAYMENT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  ticket: 'Boleto',
  bank_transfer: 'Pix / Transferência',
  account_money: 'Saldo em conta MP',
  atm: 'Caixa eletrônico',
};

async function fetchPayment(paymentId: string) {
  if (!paymentId || !MP_ACCESS_TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
    );
    if (!res.ok) return null;
    const p = await res.json();
    return {
      type_id: p.payment_type_id || null,
      type_label: PAYMENT_TYPE_LABELS[p.payment_type_id] || p.payment_type_id || '—',
      method_id: p.payment_method_id || null,
      installments: p.installments ?? null,
      status: p.status || null,
      status_detail: p.status_detail || null,
      amount: typeof p.transaction_amount === 'number' ? p.transaction_amount : null,
    };
  } catch {
    return null;
  }
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

  let body: any = {};
  try { body = await req.json(); } catch { /* opcional */ }
  const orderId = body.order_id;
  if (!orderId) return json({ error: 'order_id é obrigatório.' }, 400);

  const { data: order, error: orderErr } = await admin
    .from('orders').select('*, order_items(*)').eq('id', orderId).single();
  if (orderErr || !order) return json({ error: 'Pedido não encontrado.' }, 404);

  // Cliente: nome/telefone em profiles, e-mail em auth.users.
  const [{ data: profile }, { data: userData }] = await Promise.all([
    admin.from('profiles').select('full_name, phone').eq('id', order.user_id).maybeSingle(),
    admin.auth.admin.getUserById(order.user_id),
  ]);

  // Endereço de entrega completo.
  let address = null;
  if (order.shipping_address_id) {
    const { data: addr } = await admin
      .from('addresses').select('*').eq('id', order.shipping_address_id).maybeSingle();
    address = addr || null;
  }

  const payment = await fetchPayment(order.mp_payment_id);

  return json({
    order,
    customer: {
      email: userData?.user?.email || null,
      full_name: profile?.full_name || null,
      phone: profile?.phone || null,
    },
    address,
    payment,
  });
});

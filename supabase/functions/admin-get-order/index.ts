// deno-lint-ignore-file no-explicit-any
import { AdminAuthError, requireAdmin } from '../_shared/require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';
import { isPaymentId, isUuid, moneyToCents } from '../_shared/payment.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const PAYMENT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  ticket: 'Boleto',
  bank_transfer: 'Pix / Transferencia',
  account_money: 'Saldo em conta MP',
  atm: 'Caixa eletronico',
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function fetchPayment(paymentId: string): Promise<Record<string, unknown> | null> {
  if (!isPaymentId(paymentId) || !MP_ACCESS_TOKEN) return null;
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return null;
    const payment = await response.json();
    const typeId = String(payment.payment_type_id ?? '');
    return {
      type_id: typeId || null,
      type_label: PAYMENT_TYPE_LABELS[typeId] ?? typeId ?? null,
      method_id: typeof payment.payment_method_id === 'string'
        ? payment.payment_method_id
        : null,
      installments: Number.isInteger(payment.installments) ? payment.installments : null,
      status: typeof payment.status === 'string' ? payment.status : null,
      status_detail: typeof payment.status_detail === 'string'
        ? payment.status_detail.slice(0, 100)
        : null,
      amount_cents: moneyToCents(payment.transaction_amount),
    };
  } catch {
    return null;
  }
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

  let body: { order_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'JSON invalido.' }, 400);
  }
  if (!isUuid(body.order_id)) return json(req, { error: 'order_id invalido.' }, 400);

  const { data: order, error } = await context.admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', body.order_id)
    .single();
  if (error || !order) return json(req, { error: 'Pedido nao encontrado.' }, 404);

  const [{ data: profile }, { data: userData }] = await Promise.all([
    context.admin.from('profiles')
      .select('full_name, phone')
      .eq('id', order.user_id)
      .maybeSingle(),
    context.admin.auth.admin.getUserById(order.user_id),
  ]);

  let address = order.shipping_address_snapshot
    && typeof order.shipping_address_snapshot === 'object'
    && !Array.isArray(order.shipping_address_snapshot)
    ? order.shipping_address_snapshot
    : null;
  if (!address && order.shipping_address_id) {
    const result = await context.admin
      .from('addresses')
      .select('*')
      .eq('id', order.shipping_address_id)
      .maybeSingle();
    address = result.data ?? null;
  }

  return json(req, {
    order,
    customer: {
      email: userData?.user?.email ?? null,
      full_name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
    },
    address,
    payment: await fetchPayment(String(order.mp_payment_id ?? '')),
  });
});

// =====================================================================
// DRUZA — Edge Function: process-payment
// Recebe os dados que o Payment Brick (checkout embutido) devolveu no
// onSubmit e efetivamente cobra o pedido via API do MercadoPago.
//
// Variáveis de ambiente (configurar com `supabase secrets set`):
//   - MP_ACCESS_TOKEN                   (mesma do webhook-mp)
//   - SUPABASE_SERVICE_ROLE_KEY         (auto — necessária pra promover
//     o pedido a "paid": só service_role tem essa permissão, igual ao
//     webhook-mp — ver policy "orders_insert_own_pending" em
//     db/schema-payments.sql)
//
// O cliente chama esta função autenticado (JWT). Validamos o JWT e
// conferimos que o pedido pertence ao usuário ANTES de cobrar — o total
// cobrado vem sempre do pedido já criado por create-order (nunca do
// browser nesta chamada).
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { CORS } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';
import { mapMpStatus } from '../_shared/mp-status.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface ReqBody {
  order_id: string;
  token?: string;
  payment_method_id: string;
  issuer_id?: string;
  installments?: number;
  payer?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Cobrança é o passo mais sensível do fluxo — limite mais apertado que
  // create-order pra dificultar tentativa de força bruta em cartões.
  const limited = rateLimit(req, CORS, { limit: 10 });
  if (limited) return limited;

  // 1) Autenticação do usuário via JWT do header
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Não autenticado.' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userResult.user) return json({ error: 'Sessão inválida.' }, 401);
  const user = userResult.user;

  // 2) Validar body
  let body: ReqBody;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }
  if (!body.order_id || !body.payment_method_id) {
    return json({ error: 'Dados de pagamento incompletos.' }, 400);
  }

  // 3) Buscar o pedido — a policy "orders_select_own" (RLS) já garante que
  // só volta linha se for do usuário autenticado. O total cobrado vem
  // daqui, nunca do payload do browser.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, user_id, total_cents, status')
    .eq('id', body.order_id)
    .single();
  if (orderErr || !order) return json({ error: 'Pedido não encontrado.' }, 404);
  if (order.status !== 'pending') {
    return json({ error: 'Este pedido já foi processado.' }, 409);
  }

  // 4) Cobrar via API do MercadoPago. Idempotency-Key novo a cada
  // tentativa: se o cliente reenviar após uma falha de rede, o MP trata
  // como uma cobrança nova (não duplica pagamento de uma tentativa que
  // já tinha ido adiante, pois cada chave só é usada uma vez aqui).
  const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      // toFixed(2) evita que a divisão gere um float com mais de 2 casas
      // (ex.: 100.57000000000001), que o MP pode recusar.
      transaction_amount: Number((order.total_cents / 100).toFixed(2)),
      token: body.token,
      installments: body.installments ?? 1,
      payment_method_id: body.payment_method_id,
      issuer_id: body.issuer_id,
      payer: body.payer,
      external_reference: order.id,
      description: `Druza — pedido ${order.id}`,
      metadata: { order_id: order.id, user_id: user.id },
    }),
  });

  const payment = await mpRes.json();
  if (!mpRes.ok) {
    console.error('MP recusou o pagamento', { orderId: order.id, detail: payment });
    return json({
      status: 'canceled',
      error: 'O MercadoPago recusou o pagamento.',
      detail: payment?.message || payment?.status_detail,
    }, 200);
  }

  const newStatus = mapMpStatus(String(payment.status || ''));

  // 5) Atualizar o pedido. Promoção pra "paid" exige service_role — o
  // client autenticado por JWT do usuário não tem policy de UPDATE pra
  // isso (mesma regra que o webhook-mp já segue).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Só travamos "status" do pedido quando o pagamento é de fato aprovado.
  // Uma recusa (newStatus === 'canceled') fica registrada em payment_status
  // pra auditoria, mas o pedido continua "pending" — é isso que permite o
  // cliente tentar outro cartão com o MESMO order_id sem cair na trava
  // "pedido já processado" logo acima.
  const updateFields: Record<string, string> = {
    payment_status: String(payment.status || ''),
    mp_payment_id: String(payment.id),
  };
  if (newStatus === 'paid') {
    updateFields.status = 'paid';
    updateFields.paid_at = new Date().toISOString();
  }

  const { error: updateErr } = await admin
    .from('orders')
    .update(updateFields)
    .eq('id', order.id);
  if (updateErr) {
    console.error('order update failed', updateErr);
    return json({ error: 'Falha ao atualizar pedido.', detail: updateErr.message }, 500);
  }

  // Pix: o MP devolve o QR Code e o código copia-e-cola em
  // point_of_interaction.transaction_data. SEM isso o cliente não tem
  // como pagar — o front precisa exibir esses dados (não basta mandar
  // pra uma página de "pendente"). O webhook confirma o pagamento depois.
  const td = payment?.point_of_interaction?.transaction_data;
  const pix = (td && (td.qr_code || td.qr_code_base64))
    ? {
        qr_code: td.qr_code ?? null,
        qr_code_base64: td.qr_code_base64 ?? null,
        ticket_url: td.ticket_url ?? null,
      }
    : null;

  return json({ status: newStatus, order_id: order.id, pix });
});

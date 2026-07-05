// =====================================================================
// DRUZA — Edge Function: webhook-mp
//
// Recebe notificações do MercadoPago e atualiza o status do pedido.
//
// MODELO DE SEGURANÇA (duas camadas; a 2ª é a âncora de confiança):
//
//   1) HMAC da x-signature — camada extra ("defense in depth"). Se a
//      assinatura bater com um dos secrets configurados, ótimo. Se NÃO
//      bater, apenas logamos: NÃO é o que garante a segurança.
//
//   2) Re-consulta autenticada na API do MP — a PROVA de verdade.
//      Pegamos o id do pagamento da notificação e consultamos
//      GET /v1/payments/{id} usando o NOSSO Access Token secreto. O MP
//      só devolve o pagamento se ele pertencer à nossa conta. Uma
//      notificação forjada aponta para um id que (a) não existe, ou
//      (b) não é nosso → a consulta falha → rejeitamos. Um id real
//      nosso devolve o status VERDADEIRO direto da API — nunca
//      confiamos no status que vem no corpo do webhook.
//
//   3) Conferência de valor — o valor do pagamento tem que bater com o
//      total do pedido antes de marcar como "pago". Impede que um id de
//      pagamento de valor menor promova um pedido maior.
//
// Por que não depender só do HMAC: o ambiente do MP assinou as
// notificações reais desta conta com uma chave diferente da mostrada no
// painel (o simulador bate, os pagamentos reais não). A re-consulta na
// API contorna isso e é uma prova mais forte. Quando/se a assinatura
// passar a bater, o log 'sig: hmac-ok' aparece e podemos endurecer.
//
// Variáveis de ambiente:
//   - MP_ACCESS_TOKEN            (mesma do create-preference)
//   - MP_WEBHOOK_SECRET          (secret do webhook do painel — opcional p/ HMAC)
//   - MP_WEBHOOK_SECRET_PROD     (opcional — 2º secret p/ HMAC)
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto)
//
// Deploy com  --no-verify-jwt  (o MP não manda JWT do Supabase).
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;

const WEBHOOK_SECRETS: string[] = [
  Deno.env.get('MP_WEBHOOK_SECRET'),
  Deno.env.get('MP_WEBHOOK_SECRET_PROD'),
]
  .flatMap((s) => (s ?? '').split(','))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

function mapMpStatus(mpStatus: string): string {
  switch (mpStatus) {
    case 'approved':     return 'paid';
    case 'pending':      return 'pending';
    case 'in_process':   return 'pending';
    case 'rejected':     return 'canceled';
    case 'cancelled':    return 'canceled';
    case 'refunded':     return 'refunded';
    case 'charged_back': return 'refunded';
    default:             return 'pending';
  }
}

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseSignature(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const map: Record<string, string> = {};
  for (const p of header.split(',').map((x) => x.trim())) {
    const i = p.indexOf('=');
    if (i > 0) map[p.slice(0, i)] = p.slice(i + 1);
  }
  if (!map.ts || !map.v1) return null;
  return { ts: map.ts, v1: map.v1 };
}

// Camada 1: confere HMAC contra os secrets configurados (best-effort).
async function checkHmac(manifest: string, v1: string): Promise<boolean> {
  for (const secret of WEBHOOK_SECRETS) {
    if (safeEqual(await hmacSha256Hex(secret, manifest), v1)) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const requestId = req.headers.get('x-request-id') ?? '';
  const sig = parseSignature(req.headers.get('x-signature'));

  let bodyText = '';
  try { bodyText = await req.text(); } catch { /* corpo opcional */ }
  let body: any = null;
  if (bodyText) { try { body = JSON.parse(bodyText); } catch { /* não-JSON */ } }

  // Só agimos sobre pagamentos. Qualquer outro tópico é ignorado sem risco.
  const topic = body?.type || body?.topic
    || url.searchParams.get('type') || url.searchParams.get('topic');
  if (topic && topic !== 'payment') return new Response('Ignored', { status: 200 });

  // ID do pagamento (v2: ?data.id=, legacy: ?id=, fallback no corpo).
  let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || '';
  if (!paymentId && body?.data?.id != null) paymentId = String(body.data.id);
  if (!paymentId && body?.id != null) paymentId = String(body.id);
  if (!paymentId) return new Response('Missing payment id', { status: 400 });

  // -----------------------------------------------------------------
  // Camada 1 (best-effort): HMAC da assinatura. Não bloqueia.
  // -----------------------------------------------------------------
  let hmacOk = false;
  if (sig && WEBHOOK_SECRETS.length > 0) {
    const manifest = `id:${paymentId};request-id:${requestId};ts:${sig.ts};`;
    hmacOk = await checkHmac(manifest, sig.v1);
  }

  // -----------------------------------------------------------------
  // Camada 2 (âncora de confiança): re-consulta autenticada na API do MP.
  // O MP só devolve o pagamento se ele for da NOSSA conta.
  // -----------------------------------------------------------------
  const payRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
  );
  if (!payRes.ok) {
    // 404 = pagamento inexistente ou de outra conta → notificação não confiável.
    console.warn('pagamento não verificado na API do MP — rejeitado', {
      paymentId, mpStatus: payRes.status, hmacOk,
    });
    return new Response('Unverified payment', { status: 401 });
  }
  const payment = await payRes.json();

  const orderId = payment?.external_reference;
  if (!orderId) return new Response('No external_reference', { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Busca o pedido correspondente (precisa existir e ser nosso).
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, total_cents, status, paid_at')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) {
    console.warn('pedido do external_reference não encontrado', { orderId, paymentId });
    return new Response('Order not found', { status: 200 });
  }

  const newStatus = mapMpStatus(String(payment.status || ''));

  // -----------------------------------------------------------------
  // Camada 3: conferência de valor antes de promover para "pago".
  // -----------------------------------------------------------------
  if (newStatus === 'paid' && typeof payment.transaction_amount === 'number') {
    const paidCents = Math.round(payment.transaction_amount * 100);
    if (Math.abs(paidCents - order.total_cents) > 1) {
      console.error('valor do pagamento diverge do total do pedido — não marcado como pago', {
        orderId, paymentId, paidCents, orderTotal: order.total_cents,
      });
      return new Response('Amount mismatch', { status: 409 });
    }
  }

  const updateFields: Record<string, string> = {
    status: newStatus,
    payment_status: String(payment.status || ''),
    mp_payment_id: String(payment.id),
  };
  if (newStatus === 'paid' && !order.paid_at) {
    updateFields.paid_at = new Date().toISOString();
  }

  const { error: updateErr } = await admin
    .from('orders')
    .update(updateFields)
    .eq('id', orderId);

  if (updateErr) {
    console.error('order update failed', updateErr);
    return new Response('DB update failed', { status: 500 });
  }

  console.log('pedido atualizado', {
    orderId, newStatus, paymentId,
    sig: hmacOk ? 'hmac-ok' : 'hmac-nao-bateu (validado pela API)',
  });
  return new Response('OK', { status: 200 });
});

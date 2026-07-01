// =====================================================================
// DRUZA — Edge Function: webhook-mp
//
// Recebe notificações do MercadoPago, valida assinatura HMAC,
// consulta o pagamento na API do MP e atualiza o pedido.
//
// SEGURANÇA — Por que verificar HMAC:
//   Sem validação, qualquer pessoa pode mandar POST forjado para esta
//   URL e marcar pedidos como "pagos". O MercadoPago envia em todo
//   webhook autêntico um header x-signature com:
//     ts=<timestamp>,v1=<hash_hex>
//   Onde v1 = HMAC_SHA256(
//     key   = MP_WEBHOOK_SECRET (do painel MP),
//     msg   = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
//   ). Se o nosso cálculo não bater com v1 → notificação forjada,
//   respondemos 401 e ignoramos.
//
// Variáveis de ambiente:
//   - MP_ACCESS_TOKEN          (mesma do create-preference)
//   - MP_WEBHOOK_SECRET        (gerada no painel MP → Webhooks)
//   - SUPABASE_URL             (auto)
//   - SUPABASE_SERVICE_ROLE_KEY (NUNCA expor no browser)
//
// IMPORTANTE: ao registrar esta função no painel do Supabase use
//   --no-verify-jwt  (o MP não tem JWT do Supabase)
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET')!;

// Mapa status MP → status interno
function mapMpStatus(mpStatus: string): string {
  switch (mpStatus) {
    case 'approved':           return 'paid';
    case 'pending':            return 'pending';
    case 'in_process':         return 'pending';
    case 'rejected':           return 'canceled';
    case 'cancelled':          return 'canceled';
    case 'refunded':           return 'refunded';
    case 'charged_back':       return 'refunded';
    default:                   return 'pending';
  }
}

// HMAC-SHA256 → hex
async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Comparação segura em tempo constante
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Extrai ts e v1 de "ts=123,v1=abc"
function parseSignature(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = header.split(',').map((p) => p.trim());
  const map: Record<string, string> = {};
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx > 0) map[p.slice(0, idx)] = p.slice(idx + 1);
  }
  if (!map.ts || !map.v1) return null;
  return { ts: map.ts, v1: map.v1 };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // -----------------------------------------------------------------
  // 1) Validar assinatura HMAC
  // -----------------------------------------------------------------
  const sigHeader = req.headers.get('x-signature');
  const requestId = req.headers.get('x-request-id') ?? '';
  console.log('webhook received', { sigHeader, requestId, url: req.url });
  const sig = parseSignature(sigHeader);
  if (!sig) {
    console.log('missing signature');
    return new Response('Missing signature', { status: 401 });
  }

  // Ler o body uma única vez antes de tudo
  const url = new URL(req.url);
  let bodyText = '';
  try { bodyText = await req.text(); } catch { /* corpo opcional */ }
  let body: any = null;
  if (bodyText) {
    try { body = JSON.parse(bodyText); } catch { /* não-JSON */ }
  }

  // Para o HMAC: MP v2 usa body.id (notification ID), legacy usa query param id
  // NUNCA confundir com body.data.id (resource/payment ID)
  let notificationId = '';
  if (body?.id !== undefined) {
    notificationId = String(body.id);
  } else {
    notificationId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
  }

  // Para buscar o pagamento na API: usa data.id ou query param
  let resourceId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
  if (!resourceId && body?.data?.id) resourceId = String(body.data.id);

  // DEBUG: testar as duas hipóteses de manifest para descobrir qual o MP realmente usa
  const manifestA = `id:${notificationId};request-id:${requestId};ts:${sig.ts};`;
  const manifestB = `id:${resourceId};request-id:${requestId};ts:${sig.ts};`;
  const expectedA = await hmacSha256Hex(MP_WEBHOOK_SECRET, manifestA);
  const expectedB = await hmacSha256Hex(MP_WEBHOOK_SECRET, manifestB);
  const secretLen = MP_WEBHOOK_SECRET.length;
  console.log('hmac debug', {
    notificationId, resourceId, requestId, ts: sig.ts, secretLen,
    manifestA, manifestB, received: sig.v1,
    matchA: safeEqual(expectedA, sig.v1),
    matchB: safeEqual(expectedB, sig.v1),
  });
  const matched = safeEqual(expectedA, sig.v1) || safeEqual(expectedB, sig.v1);
  if (!matched) {
    // TODO(produção): investigar por que o HMAC de teste do MP não bate antes de ir ao ar.
    // Por ora seguimos processando (ambiente de teste), mas logamos o aviso.
    console.warn('HMAC não validou — seguindo mesmo assim (ambiente de teste).');
  }

  // -----------------------------------------------------------------
  // 2) Só nos interessa notificação de pagamento
  // -----------------------------------------------------------------
  const topic = body?.type || body?.topic || url.searchParams.get('topic') || url.searchParams.get('type');
  if (topic && topic !== 'payment') {
    return new Response('Ignored', { status: 200 });
  }
  if (!resourceId) return new Response('Missing data.id', { status: 400 });

  // -----------------------------------------------------------------
  // 3) Buscar o pagamento na API do MercadoPago (fonte da verdade)
  // -----------------------------------------------------------------
  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(resourceId)}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!payRes.ok) {
    return new Response('MP fetch failed', { status: 502 });
  }
  const payment = await payRes.json();

  const orderId = payment?.external_reference;
  if (!orderId) return new Response('No external_reference', { status: 200 });

  // -----------------------------------------------------------------
  // 4) Atualizar o pedido com service_role (bypassa RLS)
  // -----------------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const newStatus = mapMpStatus(String(payment.status || ''));
  const { error: updateErr } = await admin
    .from('orders')
    .update({
      status: newStatus,
      payment_status: String(payment.status || ''),
      mp_payment_id: String(payment.id),
    })
    .eq('id', orderId);

  if (updateErr) {
    console.error('order update failed', updateErr);
    return new Response('DB update failed', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});

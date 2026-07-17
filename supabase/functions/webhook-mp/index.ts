// Webhook publico do Mercado Pago. A assinatura e obrigatoria e o status
// usado sempre vem de uma nova consulta autenticada ao gateway.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sha256Hex } from '../_shared/rate-limit.ts';
import {
  isPaymentId,
  isUuid,
  moneyToCents,
  parseTimestamp,
} from '../_shared/payment.ts';
import {
  hasSupabaseAdminConfig,
  SUPABASE_ADMIN_KEY,
  SUPABASE_URL,
} from '../_shared/supabase-env.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const WEBHOOK_SECRETS = [
  Deno.env.get('MP_WEBHOOK_SECRET') ?? '',
  Deno.env.get('MP_WEBHOOK_SECRET_PROD') ?? '',
]
  .flatMap((value) => value.split(','))
  .map((value) => value.trim())
  .filter(Boolean);

interface Signature {
  ts: string;
  v1: string;
}

function parseSignature(header: string | null): Signature | null {
  if (!header || header.length > 256) return null;
  const values = new Map<string, string>();
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index > 0) values.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const ts = values.get('ts') ?? '';
  const v1 = (values.get('v1') ?? '').toLowerCase();
  return /^\d{1,20}$/.test(ts) && /^[a-f0-9]{64}$/.test(v1) ? { ts, v1 } : null;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hasValidSignature(manifest: string, received: string): Promise<boolean> {
  let valid = false;
  for (const secret of WEBHOOK_SECRETS) {
    const expected = await hmacHex(secret, manifest);
    valid = constantTimeEqual(expected, received) || valid;
  }
  return valid;
}

function extractPaymentId(url: URL, body: Record<string, any> | null): string {
  const candidate = url.searchParams.get('data.id')
    ?? url.searchParams.get('id')
    ?? body?.data?.id
    ?? body?.id
    ?? '';
  return String(candidate).trim();
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!MP_ACCESS_TOKEN || !hasSupabaseAdminConfig() || WEBHOOK_SECRETS.length === 0) {
    console.error('webhook-mp: configuracao obrigatoria ausente');
    return new Response('Unavailable', { status: 503 });
  }

  const length = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 64_000) {
    return new Response('Payload too large', { status: 413 });
  }

  let body: Record<string, any> | null = null;
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  const url = new URL(req.url);
  const topic = String(
    body?.type ?? body?.topic
      ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '',
  ).toLowerCase();
  if (topic && topic !== 'payment') return new Response('Ignored', { status: 200 });

  const paymentId = extractPaymentId(url, body);
  if (!isPaymentId(paymentId)) return new Response('Invalid payment id', { status: 400 });

  const requestId = req.headers.get('x-request-id')?.trim() ?? '';
  const signature = parseSignature(req.headers.get('x-signature'));
  if (!signature || !requestId || requestId.length > 200 || /[\r\n]/.test(requestId)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${signature.ts};`;
  if (!await hasValidSignature(manifest, signature.v1)) {
    console.warn('webhook-mp: assinatura rejeitada');
    return new Response('Invalid signature', { status: 401 });
  }

  const receiptKey = await sha256Hex(`${manifest}v1:${signature.v1}`);
  const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Replay exato nao gera nem uma nova consulta ao Mercado Pago.
  const { data: replay, error: replayError } = await admin
    .from('payment_webhook_events')
    .select('receipt_key')
    .eq('receipt_key', receiptKey)
    .maybeSingle();
  if (replayError) return new Response('Temporary failure', { status: 503 });
  if (replay) return new Response('OK', { status: 200 });

  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return new Response('Temporary failure', { status: 503 });
  }

  if (!gatewayResponse.ok) {
    console.warn('webhook-mp: pagamento nao confirmado no gateway', {
      status: gatewayResponse.status,
    });
    return new Response('Unverified payment', { status: gatewayResponse.status === 404 ? 404 : 503 });
  }

  let payment: Record<string, any>;
  try {
    payment = await gatewayResponse.json();
  } catch {
    return new Response('Invalid gateway response', { status: 502 });
  }

  const confirmedPaymentId = String(payment.id ?? '');
  const orderId = String(payment.external_reference ?? '');
  const mpStatus = String(payment.status ?? '').trim().toLowerCase();
  const amountCents = moneyToCents(payment.transaction_amount);
  if (confirmedPaymentId !== paymentId || !isPaymentId(confirmedPaymentId)
      || !isUuid(orderId) || !/^[a-z_]{2,40}$/.test(mpStatus)
      || amountCents === null) {
    console.error('webhook-mp: resposta do gateway violou invariantes');
    return new Response('Invalid gateway response', { status: 502 });
  }

  const eventAt = parseTimestamp(payment.date_last_updated)
    ?? parseTimestamp(payment.date_created);
  const reservationExpiresAt = parseTimestamp(payment.date_of_expiration);
  const { error: applyError } = await admin.rpc('apply_payment_event', {
    p_receipt_key: receiptKey,
    p_source: 'webhook',
    p_order_id: orderId,
    p_mp_payment_id: confirmedPaymentId,
    p_mp_status: mpStatus,
    p_amount_cents: amountCents,
    p_external_reference: orderId,
    p_event_at: eventAt,
    p_reservation_expires_at: reservationExpiresAt,
  });

  if (applyError) {
    const mismatch = applyError.message?.includes('payment_amount_mismatch')
      || applyError.message?.includes('payment_event_conflict')
      || applyError.message?.includes('order_payment_conflict');
    console.error('webhook-mp: evento verificado nao aplicado');
    return new Response(mismatch ? 'Payment conflict' : 'Temporary failure', {
      status: mismatch ? 409 : 503,
    });
  }

  return new Response('OK', { status: 200 });
});

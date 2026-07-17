// Reconsulta tentativas processing antigas. A rota e publica por necessidade
// do cron, mas nao aceita parametros e usa um lock duravel para executar no
// maximo uma vez por janela.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { consumeDurableLimit, sha256Hex } from '../_shared/rate-limit.ts';
import {
  isPaymentId,
  moneyToCents,
  parseTimestamp,
} from '../_shared/payment.ts';
import {
  hasSupabaseAdminConfig,
  SUPABASE_ADMIN_KEY,
  SUPABASE_URL,
} from '../_shared/supabase-env.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';

async function fetchPayment(
  orderId: string,
  paymentId: string | null,
): Promise<Record<string, any> | null | undefined> {
  const url = paymentId && isPaymentId(paymentId)
    ? `https://api.mercadopago.com/v1/payments/${paymentId}`
    : `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return undefined;
  }

  if (response.status === 404) return null;
  if (!response.ok) return undefined;
  try {
    const payload = await response.json();
    if (paymentId) return payload;
    return Array.isArray(payload?.results) && payload.results.length > 0
      ? payload.results[0]
      : null;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!hasSupabaseAdminConfig() || !MP_ACCESS_TOKEN) {
    return new Response('Unavailable', { status: 503 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const shouldRun = await consumeDurableLimit(
      admin as any,
      'job:reconcile-payments',
      'reconcile-stale-payments',
      1,
      240,
    );
    if (!shouldRun) return new Response('Accepted', { status: 202 });
  } catch {
    return new Response('Unavailable', { status: 503 });
  }

  await admin.rpc('release_expired_pending_reservations', { p_limit: 100 });
  const { data: candidates, error } = await admin.rpc(
    'list_payment_reconciliation_candidates',
    { p_limit: 25 },
  );
  if (error || !Array.isArray(candidates)) {
    return new Response('Unavailable', { status: 503 });
  }

  let reconciled = 0;
  let deferred = 0;
  for (const candidate of candidates) {
    const orderId = String(candidate.order_id ?? '');
    const paymentId = candidate.mp_payment_id == null
      ? null
      : String(candidate.mp_payment_id);
    const payment = await fetchPayment(orderId, paymentId);

    if (payment === undefined) {
      deferred += 1;
      continue;
    }
    if (payment === null) {
      await admin.rpc('reconcile_payment_not_found', {
        p_order_id: orderId,
        p_attempt_key: candidate.payment_attempt_key,
      });
      reconciled += 1;
      continue;
    }

    const confirmedPaymentId = String(payment.id ?? '');
    const externalReference = String(payment.external_reference ?? '');
    const status = String(payment.status ?? '').trim().toLowerCase();
    const amountCents = moneyToCents(payment.transaction_amount);
    if (!isPaymentId(confirmedPaymentId) || externalReference !== orderId
        || !/^[a-z_]{2,40}$/.test(status) || amountCents === null) {
      deferred += 1;
      continue;
    }

    const eventAt = parseTimestamp(payment.date_last_updated)
      ?? parseTimestamp(payment.date_created);
    const expiration = parseTimestamp(payment.date_of_expiration);
    const receiptKey = await sha256Hex(
      `reconciler:${confirmedPaymentId}:${status}:${eventAt ?? ''}`,
    );
    const { error: applyError } = await admin.rpc('apply_payment_event', {
      p_receipt_key: receiptKey,
      p_source: 'reconciler',
      p_order_id: orderId,
      p_mp_payment_id: confirmedPaymentId,
      p_mp_status: status,
      p_amount_cents: amountCents,
      p_external_reference: externalReference,
      p_event_at: eventAt,
      p_reservation_expires_at: expiration,
    });
    if (applyError) deferred += 1;
    else reconciled += 1;
  }

  console.log('reconcile-stale-payments: execucao concluida', {
    candidates: candidates.length,
    reconciled,
    deferred,
  });
  return new Response('OK', { status: 200 });
});

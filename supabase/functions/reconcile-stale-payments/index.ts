// Reconsulta tentativas processing antigas. O cron autentica cada chamada com
// HMAC antes de qualquer leitura de configuracao administrativa ou acesso ao
// banco e usa um lock duravel para executar no maximo uma vez por janela.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { authenticateReconcileRequest } from '../_shared/reconcile-auth.ts';
import { consumeDurableLimit, sha256Hex } from '../_shared/rate-limit.ts';
import {
  isPaymentId,
  moneyToCents,
  parseTimestamp,
} from '../_shared/payment.ts';

async function fetchPayment(
  accessToken: string,
  orderId: string,
  paymentId: string | null,
): Promise<Record<string, any> | null | undefined> {
  const url = paymentId && isPaymentId(paymentId)
    ? `https://api.mercadopago.com/v1/payments/${paymentId}`
    : `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const auth = await authenticateReconcileRequest(req, {
    currentSecret: Deno.env.get('RECONCILE_CRON_HMAC_SECRET_CURRENT'),
    previousSecret: Deno.env.get('RECONCILE_CRON_HMAC_SECRET_PREVIOUS'),
  });
  if (!auth.ok) {
    const message = auth.status === 503
      ? 'Unavailable'
      : auth.status === 401
      ? 'Unauthorized'
      : 'Bad request';
    return new Response(message, { status: auth.status });
  }

  const privilegedConfig = readPrivilegedConfig();
  if (!privilegedConfig.ok) {
    return authenticatedResponse('Unavailable', 503);
  }

  const admin = createClient(
    privilegedConfig.supabaseUrl,
    privilegedConfig.supabaseAdminKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const shouldRun = await consumeDurableLimit(
      admin as any,
      'job:reconcile-payments',
      'reconcile-stale-payments',
      1,
      240,
    );
    if (!shouldRun) return authenticatedResponse('Accepted', 202);
  } catch {
    return authenticatedResponse('Unavailable', 503);
  }

  await admin.rpc('release_expired_pending_reservations', { p_limit: 100 });
  const { data: candidates, error } = await admin.rpc(
    'list_payment_reconciliation_candidates',
    { p_limit: 25 },
  );
  if (error || !Array.isArray(candidates)) {
    return authenticatedResponse('Unavailable', 503);
  }

  let reconciled = 0;
  let deferred = 0;
  for (const candidate of candidates) {
    const orderId = String(candidate.order_id ?? '');
    const paymentId = candidate.mp_payment_id == null
      ? null
      : String(candidate.mp_payment_id);
    const payment = await fetchPayment(
      privilegedConfig.mpAccessToken,
      orderId,
      paymentId,
    );

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
  return authenticatedResponse('OK', 200);
});

function readPrivilegedConfig():
  | {
    ok: true;
    supabaseUrl: string;
    supabaseAdminKey: string;
    mpAccessToken: string;
  }
  | { ok: false } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAdminKey = readNamedAdminKey()
    || Deno.env.get('SUPABASE_SECRET_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    || '';
  const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN') ?? '';

  if (!supabaseUrl || !supabaseAdminKey || !mpAccessToken) {
    return { ok: false };
  }
  return { ok: true, supabaseUrl, supabaseAdminKey, mpAccessToken };
}

function readNamedAdminKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  if (!raw) return '';
  try {
    const keys = JSON.parse(raw) as Record<string, unknown>;
    const name = Deno.env.get('SUPABASE_API_KEY_NAME')?.trim() || 'default';
    return typeof keys[name] === 'string' ? keys[name] : '';
  } catch {
    return '';
  }
}

function authenticatedResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'x-druza-reconciler-auth': 'v1' },
  });
}

// Cobra um pedido com claim atomico e chave idempotente persistida.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  corsHeaders,
  preflight,
  rejectDisallowedOrigin,
} from '../_shared/cors.ts';
import {
  consumeDurableLimit,
  rateLimit,
  sha256Hex,
} from '../_shared/rate-limit.ts';
import {
  centsToAmount,
  isPaymentId,
  isUuid,
  moneyToCents,
  parseTimestamp,
  stableStringify,
} from '../_shared/payment.ts';
import {
  hasSupabaseConfig,
  SUPABASE_ADMIN_KEY,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
} from '../_shared/supabase-env.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';

interface RequestBody {
  order_id: string;
  token?: unknown;
  payment_method_id?: unknown;
  issuer_id?: unknown;
  installments?: unknown;
  payer?: unknown;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function publicStatus(mpStatus: string): 'paid' | 'pending' | 'canceled' {
  if (mpStatus === 'approved') return 'paid';
  if (['pending', 'in_process', 'authorized'].includes(mpStatus)) return 'pending';
  return 'canceled';
}

function sanitizePayer(value: unknown, accountEmail: string): Record<string, unknown> {
  const payer: Record<string, unknown> = { email: accountEmail };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return payer;

  const raw = value as Record<string, unknown>;
  const identification = raw.identification;
  if (identification && typeof identification === 'object' && !Array.isArray(identification)) {
    const id = identification as Record<string, unknown>;
    const type = typeof id.type === 'string' ? id.type.trim().toUpperCase() : '';
    const number = typeof id.number === 'string' ? id.number.replace(/\D/g, '') : '';
    if (/^[A-Z]{2,10}$/.test(type) && /^\d{5,20}$/.test(number)) {
      payer.identification = { type, number };
    }
  }
  return payer;
}

function claimError(message = ''): { message: string; status: number } {
  if (message.includes('payment_in_progress')) {
    return { message: 'Ja existe uma tentativa de pagamento em processamento.', status: 409 };
  }
  if (message.includes('order_not_found')) {
    return { message: 'Pedido nao encontrado.', status: 404 };
  }
  if (message.includes('order_canceled') || message.includes('reservation_expired')) {
    return { message: 'Este pedido expirou. Inicie um novo pagamento.', status: 409 };
  }
  return { message: 'Nao foi possivel iniciar o pagamento.', status: 409 };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const originError = rejectDisallowedOrigin(req);
  if (originError) return originError;
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao permitido.' }, 405);

  const cors = corsHeaders(req);
  const burst = rateLimit(req, cors, { limit: 10, windowMs: 60_000 });
  if (burst) return burst;
  if (!MP_ACCESS_TOKEN || !hasSupabaseConfig()) {
    return json(req, { error: 'Pagamento temporariamente indisponivel.' }, 503);
  }

  const length = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 32_000) {
    return json(req, { error: 'Requisicao grande demais.' }, 413);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(req, { error: 'Nao autenticado.' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (userError || !user || !user.email) {
    return json(req, { error: 'Sessao invalida.' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const allowed = await consumeDurableLimit(
      admin as any, 'process-payment:user', user.id, 8, 600,
    );
    if (!allowed) {
      return json(req, { error: 'Muitas tentativas de pagamento. Aguarde alguns minutos.' }, 429);
    }
  } catch {
    return json(req, { error: 'Pagamento temporariamente indisponivel.' }, 503);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'JSON invalido.' }, 400);
  }

  const method = typeof body.payment_method_id === 'string'
    ? body.payment_method_id.trim().toLowerCase()
    : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const issuer = body.issuer_id == null ? '' : String(body.issuer_id).trim();
  const installments = body.installments == null ? 1 : Number(body.installments);

  if (!isUuid(body.order_id) || !/^[a-z0-9_]{2,40}$/.test(method)
      || token.length > 2048 || issuer.length > 40
      || !Number.isInteger(installments) || installments < 1 || installments > 24) {
    return json(req, { error: 'Dados de pagamento invalidos.' }, 400);
  }

  const payer = sanitizePayer(body.payer, user.email);
  const canonicalPayment = {
    order_id: body.order_id,
    token: token || null,
    payment_method_id: method,
    issuer_id: issuer || null,
    installments,
    payer,
  };
  const fingerprint = await sha256Hex(stableStringify(canonicalPayment));

  const { data: claimData, error: claimRpcError } = await admin.rpc('claim_payment_attempt', {
    p_order_id: body.order_id,
    p_user_id: user.id,
    p_fingerprint: fingerprint,
  });
  if (claimRpcError || !claimData || typeof claimData !== 'object') {
    const publicError = claimError(claimRpcError?.message);
    return json(req, { error: publicError.message }, publicError.status);
  }

  const claim = claimData as Record<string, unknown>;
  if (claim.state === 'reservation_expired') {
    return json(req, { error: 'Este pedido expirou. Inicie um novo pagamento.' }, 409);
  }
  if (claim.state === 'already_processed') {
    const orderStatus = String(claim.order_status ?? '');
    return json(req, {
      status: ['paid', 'shipped', 'delivered', 'refunded'].includes(orderStatus)
        ? 'paid'
        : 'pending',
    });
  }

  const attemptKey = String(claim.attempt_key ?? '');
  const totalCents = Number(claim.total_cents);
  if (!isUuid(attemptKey) || !Number.isInteger(totalCents) || totalCents < 0) {
    return json(req, { error: 'Estado de pagamento invalido.' }, 500);
  }

  let mpResponse: Response;
  try {
    mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': attemptKey,
      },
      body: JSON.stringify({
        transaction_amount: centsToAmount(totalCents),
        token: token || undefined,
        installments,
        payment_method_id: method,
        issuer_id: issuer || undefined,
        payer,
        external_reference: body.order_id,
        description: `Druza - pedido ${body.order_id}`,
        metadata: { order_id: body.order_id },
      }),
    });
  } catch {
    console.error('process-payment: falha de rede no gateway');
    return json(req, { error: 'Nao foi possivel confirmar o pagamento agora.' }, 502);
  }

  let payment: Record<string, any> = {};
  try {
    payment = await mpResponse.json();
  } catch {
    payment = {};
  }

  if (!mpResponse.ok) {
    const definitiveRejection = mpResponse.status >= 400
      && mpResponse.status < 500
      && ![408, 409, 425, 429].includes(mpResponse.status);

    if (definitiveRejection) {
      await admin.rpc('cancel_payment_attempt', {
        p_order_id: body.order_id,
        p_attempt_key: attemptKey,
        p_reason: 'gateway_rejected',
      });
      console.warn('process-payment: gateway recusou a requisicao', {
        status: mpResponse.status,
      });
      return json(req, {
        status: 'canceled',
        error: 'O pagamento foi recusado. Revise os dados e tente novamente.',
      });
    }

    console.warn('process-payment: resposta temporaria do gateway', {
      status: mpResponse.status,
    });
    return json(req, {
      error: 'A confirmacao do pagamento esta em processamento. Aguarde alguns instantes.',
    }, 503);
  }

  const paymentId = String(payment.id ?? '');
  const mpStatus = String(payment.status ?? '').trim().toLowerCase();
  const amountCents = moneyToCents(payment.transaction_amount);
  const externalReference = String(payment.external_reference ?? '');
  if (!isPaymentId(paymentId)
      || !/^[a-z_]{2,40}$/.test(mpStatus)
      || amountCents === null || amountCents !== totalCents
      || externalReference !== body.order_id) {
    console.error('process-payment: resposta do gateway violou invariantes');
    return json(req, { error: 'Nao foi possivel validar o pagamento.' }, 502);
  }

  const receiptKey = await sha256Hex(
    `process-payment:${attemptKey}:${paymentId}:${mpStatus}`,
  );
  const eventAt = parseTimestamp(payment.date_last_updated)
    ?? parseTimestamp(payment.date_created);
  const reservationExpiresAt = parseTimestamp(payment.date_of_expiration);

  const { data: applied, error: applyError } = await admin.rpc('apply_payment_event', {
    p_receipt_key: receiptKey,
    p_source: 'process-payment',
    p_order_id: body.order_id,
    p_mp_payment_id: paymentId,
    p_mp_status: mpStatus,
    p_amount_cents: amountCents,
    p_external_reference: externalReference,
    p_event_at: eventAt,
    p_reservation_expires_at: reservationExpiresAt,
  });
  if (applyError || !applied) {
    console.error('process-payment: falha ao aplicar evento verificado');
    return json(req, { error: 'Pagamento recebido; confirmacao em processamento.' }, 503);
  }

  const transactionData = payment.point_of_interaction?.transaction_data;
  const pix = transactionData && typeof transactionData === 'object'
    ? {
      qr_code: typeof transactionData.qr_code === 'string' ? transactionData.qr_code : null,
      qr_code_base64: typeof transactionData.qr_code_base64 === 'string'
        ? transactionData.qr_code_base64
        : null,
      ticket_url: typeof transactionData.ticket_url === 'string'
        ? transactionData.ticket_url
        : null,
      expiration: reservationExpiresAt,
    }
    : null;

  return json(req, {
    status: publicStatus(mpStatus),
    payment_status: mpStatus,
    payment_id: paymentId,
    pix,
  });
});

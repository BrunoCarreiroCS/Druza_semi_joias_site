// Atualiza o que o painel pode mudar num pedido: etapa logistica,
// transportadora, codigo de rastreio, data de postagem e nota interna.
//
// O status financeiro (pago, cancelado, estornado) continua fora daqui de
// proposito — quem decide isso e o gateway, pelo webhook. O painel so
// avanca o que depende da loja: separacao, envio e entrega.

import { AdminRequestError, logAdminAction, serveAdmin } from '../_shared/admin-endpoint.ts';
import { cleanMultiline, cleanText, isUuid } from '../_shared/catalog-validation.ts';

interface RequestBody {
  order_id?: string;
  status?: string;
  tracking_code?: string;
  tracking_url?: string;
  shipping_carrier?: string;
  posted_at?: string;
  admin_notes?: string;
}

const ALLOWED_STATUSES = new Set(['shipped', 'delivered']);

const CARRIERS = new Set([
  'Correios', 'Jadlog', 'Loggi', 'Azul Cargo', 'Total Express',
  'Entrega própria', 'Retirada em mãos', 'Outra',
]);

function isCorreiosCode(code: string): boolean {
  return /^[A-Z]{2}\d{9}BR$/.test(code);
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const source = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00.000Z` : raw;
  const parsed = Date.parse(source);
  if (!Number.isFinite(parsed)) {
    throw new AdminRequestError('A data de postagem não é válida.');
  }
  if (parsed > Date.now() + 24 * 3600 * 1000) {
    throw new AdminRequestError('A data de postagem não pode estar no futuro.');
  }
  return new Date(parsed).toISOString();
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  if (!isUuid(body.order_id)) throw new AdminRequestError('Pedido inválido.');

  const fields: Record<string, unknown> = {};

  if (body.status) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      throw new AdminRequestError(
        'O status de pagamento é definido pelo Mercado Pago e não pode ser alterado à mão.',
      );
    }
    fields.status = body.status;
  }

  let trackingCode: string | null | undefined;
  if (typeof body.tracking_code === 'string') {
    trackingCode = cleanText(body.tracking_code, 60).toUpperCase().replace(/\s+/g, '') || null;
    fields.tracking_code = trackingCode;
  }

  if (typeof body.shipping_carrier === 'string') {
    const carrier = cleanText(body.shipping_carrier, 60);
    if (carrier && !CARRIERS.has(carrier)) {
      throw new AdminRequestError('Transportadora não reconhecida.');
    }
    fields.shipping_carrier = carrier || null;
  }

  if (typeof body.tracking_url === 'string') {
    const url = cleanText(body.tracking_url, 400);
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new AdminRequestError('O link de rastreamento não é um endereço válido.');
      }
      if (parsed.protocol !== 'https:') {
        throw new AdminRequestError('O link de rastreamento precisa começar com https.');
      }
      fields.tracking_url = parsed.toString().slice(0, 400);
    } else {
      fields.tracking_url = null;
    }
  }

  if (body.posted_at !== undefined) {
    fields.posted_at = normalizeDate(body.posted_at);
  }

  if (typeof body.admin_notes === 'string') {
    fields.admin_notes = cleanMultiline(body.admin_notes, 2000) || null;
  }

  if (Object.keys(fields).length === 0) {
    throw new AdminRequestError('Nada para atualizar.');
  }

  // Correios tem link publico e estavel: monta sozinho para a usuaria nao
  // precisar colar URL nenhuma. Outras transportadoras ficam com o campo
  // livre, porque nao ha padrao confiavel de link por codigo.
  if (trackingCode && fields.tracking_url === undefined && isCorreiosCode(trackingCode)) {
    fields.tracking_url =
      `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(trackingCode)}`;
  }
  if (trackingCode === null) {
    fields.tracking_url = null;
  }

  const { data, error } = await context.admin
    .from('orders')
    .update(fields)
    .eq('id', body.order_id)
    .select('*, order_items(*)')
    .maybeSingle();

  if (error || !data) {
    const message = error?.message ?? '';
    if (message.includes('invalid_order_status_transition')) {
      throw new AdminRequestError(
        'Esta mudança de etapa não é permitida a partir da situação atual do pedido.',
        409,
      );
    }
    if (!error && !data) throw new AdminRequestError('Pedido não encontrado.', 404);
    throw new Error(`update_order_failed: ${message}`);
  }

  await logAdminAction(
    context.admin,
    context.userId,
    'order.update',
    'orders',
    String(body.order_id),
    { changed_fields: Object.keys(fields).sort(), status: fields.status ?? null },
  );

  return { order: data };
}, { limit: 40 });

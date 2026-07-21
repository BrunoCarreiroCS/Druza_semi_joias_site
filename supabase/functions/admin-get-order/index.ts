// deno-lint-ignore-file no-explicit-any
// Ficha completa do pedido: cliente, endereco, itens (com a foto atual do
// produto), pagamento consultado no Mercado Pago e a linha do tempo.
//
// Os itens preservam nome e preco do momento da compra — o que vem de
// public.products aqui e apenas a imagem e a situacao de estoque, para a
// tela de separacao. Editar o produto depois nao muda o pedido.

import { AdminRequestError, serveAdmin } from '../_shared/admin-endpoint.ts';
import { isPaymentId, isUuid, moneyToCents } from '../_shared/payment.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const PAYMENT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  ticket: 'Boleto',
  bank_transfer: 'Pix / Transferência',
  account_money: 'Saldo em conta MP',
  atm: 'Caixa eletrônico',
};

async function fetchPayment(paymentId: string): Promise<Record<string, unknown> | null> {
  if (!isPaymentId(paymentId) || !MP_ACCESS_TOKEN) return null;
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payment = await response.json();
    const typeId = String(payment.payment_type_id ?? '');
    return {
      type_id: typeId || null,
      type_label: PAYMENT_TYPE_LABELS[typeId] ?? typeId ?? null,
      method_id: typeof payment.payment_method_id === 'string' ? payment.payment_method_id : null,
      installments: Number.isInteger(payment.installments) ? payment.installments : null,
      status: typeof payment.status === 'string' ? payment.status : null,
      status_detail: typeof payment.status_detail === 'string'
        ? payment.status_detail.slice(0, 100)
        : null,
      approved_at: typeof payment.date_approved === 'string' ? payment.date_approved : null,
      amount_cents: moneyToCents(payment.transaction_amount),
    };
  } catch {
    return null;
  }
}

serveAdmin<{ order_id?: string }>(async ({ body, context }) => {
  if (!isUuid(body.order_id)) throw new AdminRequestError('Pedido inválido.');

  const { data: order, error } = await context.admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', body.order_id)
    .maybeSingle();
  if (error) throw new Error(`get_order_failed: ${error.message}`);
  if (!order) throw new AdminRequestError('Pedido não encontrado.', 404);

  const slugs = [...new Set(((order.order_items as any[]) ?? []).map((item) => item.product_slug))];

  const [
    { data: profile },
    { data: userData },
    { data: history },
    { data: products },
  ] = await Promise.all([
    context.admin.from('profiles').select('full_name, phone').eq('id', order.user_id).maybeSingle(),
    context.admin.auth.admin.getUserById(order.user_id),
    context.admin
      .from('order_status_history')
      .select('*')
      .eq('order_id', body.order_id)
      .order('created_at', { ascending: true }),
    slugs.length
      ? context.admin
        .from('products')
        .select('slug, sku, stock_quantity, status, product_images(url, is_primary, position)')
        .in('slug', slugs)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const productBySlug = new Map<string, any>(
    ((products as any[]) ?? []).map((product) => [String(product.slug), product]),
  );

  const items = ((order.order_items as any[]) ?? []).map((item) => {
    const product = productBySlug.get(String(item.product_slug));
    const images = ((product?.product_images as any[]) ?? [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position));
    return {
      ...item,
      subtotal_cents: Number(item.unit_price_cents ?? 0) * Number(item.qty ?? 0),
      sku: product?.sku ?? null,
      image_url: (images.find((image) => image.is_primary) ?? images[0])?.url ?? null,
      current_stock: product?.stock_quantity ?? null,
      product_exists: Boolean(product),
    };
  });

  let address = order.shipping_address_snapshot
    && typeof order.shipping_address_snapshot === 'object'
    && !Array.isArray(order.shipping_address_snapshot)
    ? order.shipping_address_snapshot
    : null;
  if (!address && order.shipping_address_id) {
    const result = await context.admin
      .from('addresses').select('*').eq('id', order.shipping_address_id).maybeSingle();
    address = result.data ?? null;
  }

  return {
    order: { ...order, order_items: items },
    customer: {
      user_id: order.user_id,
      email: userData?.user?.email ?? null,
      full_name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
    },
    address,
    payment: await fetchPayment(String(order.mp_payment_id ?? '')),
    history: (history as any[]) ?? [],
  };
}, { limit: 90 });

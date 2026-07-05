// =====================================================================
// DRUZA — Edge Function: create-preference
// Cria pedido (status=pending) + preferência MercadoPago. Retorna init_point.
//
// Variáveis de ambiente (configurar com `supabase secrets set`):
//   - MP_ACCESS_TOKEN     (Access Token do MercadoPago, começa com APP_USR-)
//   - PUBLIC_SITE_URL     (URL pública do site: https://druza.com.br ou http://localhost:5510)
//
// O cliente chama esta função autenticado (JWT). Validamos o JWT, criamos
// o pedido em nome do usuário e protegemos os totais recalculando do
// catálogo no servidor — nunca confiamos no preço enviado pelo browser.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { CORS } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') ?? '';

const SHIPPING_RULES: Array<{ prefixes: string[]; price_cents: number }> = [
  { prefixes: ['01', '02', '03', '04'], price_cents: 1490 },
  { prefixes: ['20', '21', '22', '23', '24'], price_cents: 1890 },
];
const SHIPPING_FALLBACK = 2190;
const FREE_SHIPPING_THRESHOLD = 19900;
const COUPON_CODE = 'PRIMEIRADRUZA';
const COUPON_DISCOUNT = 0.10;

function shippingFor(cep: string, subtotal: number): number {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  const prefix = cep.replace(/\D/g, '').slice(0, 2);
  const rule = SHIPPING_RULES.find((r) => r.prefixes.includes(prefix));
  return rule ? rule.price_cents : SHIPPING_FALLBACK;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface BodyItem { slug: string; qty: number; size?: string }
interface ReqBody {
  items: BodyItem[];
  address_id?: string;
  address?: {
    recipient: string; cep: string; street: string; number: string;
    complement?: string; neighborhood?: string; city: string; state: string;
    label?: string; save?: boolean;
  };
  coupon?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Rate limit conservador: criar preferência dispara chamada ao MP e
  // escreve pedido — 10/min por IP é folga pra uso real e barra abuso.
  const limited = rateLimit(req, CORS, { limit: 10 });
  if (limited) return limited;

  // 1) Autenticação do usuário via JWT do header
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Não autenticado.' }, 401);

  // Cliente com o JWT do user — respeita RLS.
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

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: 'Carrinho vazio.' }, 400);
  }
  // Camada de sanidade: caps de tamanho (payloads absurdos são rejeitados
  // antes de tocar o banco — defesa em profundidade, o front nunca gera isso).
  if (body.items.length > 30) return json({ error: 'Carrinho grande demais.' }, 400);
  const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

  // 3) Resolver endereço de entrega (id salvo OU novo endereço)
  let shippingAddressId: string | null = null;
  let cepForShipping = '';

  if (body.address_id) {
    const { data: addr, error } = await supabase
      .from('addresses').select('*').eq('id', body.address_id).single();
    if (error || !addr) return json({ error: 'Endereço não encontrado.' }, 400);
    shippingAddressId = addr.id;
    cepForShipping = addr.cep;
  } else if (body.address) {
    const a = body.address;
    if (!a.recipient || !a.cep || !a.street || !a.number || !a.city || !a.state) {
      return json({ error: 'Endereço incompleto.' }, 400);
    }
    const { data: newAddr, error } = await supabase
      .from('addresses')
      .insert({
        user_id: user.id,
        label: clip(a.label, 40) || 'Endereço',
        recipient: clip(a.recipient, 120),
        cep: clip(a.cep, 9),
        street: clip(a.street, 160),
        number: clip(a.number, 20),
        complement: clip(a.complement, 120) || null,
        neighborhood: clip(a.neighborhood, 80) || null,
        city: clip(a.city, 80),
        state: clip(a.state, 2).toUpperCase(),
      })
      .select().single();
    if (error || !newAddr) return json({ error: 'Falha ao salvar endereço.' }, 500);
    shippingAddressId = newAddr.id;
    cepForShipping = newAddr.cep;
  } else {
    return json({ error: 'Informe um endereço de entrega.' }, 400);
  }

  // 4) Recalcular totais com base no catálogo oficial (anti-manipulação).
  // Preço/disponibilidade vêm da tabela products (nunca do browser) — a
  // mesma fonte de verdade usada pelo painel administrativo. A policy
  // "products_select_active" só deixa ler produtos com active=true.
  const slugs = [...new Set(body.items.map((it) => it.slug))];
  const { data: products, error: productsErr } = await supabase
    .from('products')
    .select('slug, name, price_cents, in_stock')
    .in('slug', slugs);
  if (productsErr) return json({ error: 'Falha ao consultar catálogo.', detail: productsErr.message }, 500);
  const catalogBySlug = new Map((products || []).map((p) => [p.slug, p]));

  let subtotal = 0;
  const resolvedItems = [] as Array<{ slug: string; name: string; price: number; qty: number }>;
  for (const it of body.items) {
    const cat = catalogBySlug.get(it.slug);
    if (!cat) return json({ error: `Produto inválido: ${it.slug}` }, 400);
    if (!cat.in_stock) return json({ error: `Produto fora de estoque: ${cat.name}` }, 400);
    const qty = Math.max(1, Math.min(20, Number(it.qty) || 1));
    subtotal += cat.price_cents * qty;
    resolvedItems.push({ slug: it.slug, name: cat.name, price: cat.price_cents, qty });
  }

  const discount = body.coupon?.trim().toUpperCase() === COUPON_CODE
    ? Math.round(subtotal * COUPON_DISCOUNT) : 0;
  const shipping = shippingFor(cepForShipping, subtotal);
  const total = Math.max(0, subtotal - discount + shipping);

  // 5) Criar pedido (status=pending) + itens
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'pending',
      subtotal_cents: subtotal,
      shipping_cents: shipping,
      discount_cents: discount,
      total_cents: total,
      coupon_code: discount > 0 ? COUPON_CODE : null,
      shipping_address_id: shippingAddressId,
    })
    .select().single();
  if (orderErr || !order) return json({ error: 'Falha ao criar pedido.', detail: orderErr?.message }, 500);

  const itemsInsert = resolvedItems.map((it) => ({
    order_id: order.id,
    product_slug: it.slug,
    product_name: it.name,
    unit_price_cents: it.price,
    qty: it.qty,
  }));
  const { error: itemsErr } = await supabase.from('order_items').insert(itemsInsert);
  if (itemsErr) return json({ error: 'Falha ao registrar itens.', detail: itemsErr.message }, 500);

  // 6) Criar preferência no MercadoPago
  const siteUrl = PUBLIC_SITE_URL || new URL(req.url).origin;
  const mpItems = resolvedItems.map((it) => ({
    id: it.slug,
    title: it.name,
    quantity: it.qty,
    unit_price: it.price / 100,
    currency_id: 'BRL',
  }));
  // Frete e desconto como linhas auxiliares (MP só aceita unit_price ≥ 0)
  if (shipping > 0) {
    mpItems.push({
      id: 'frete', title: 'Frete', quantity: 1,
      unit_price: shipping / 100, currency_id: 'BRL',
    });
  }
  if (discount > 0) {
    // Desconto vira "campaign" no MP (não pode usar unit_price negativo).
    // Aplicamos como ajuste no total do pedido enviado: subtraímos do primeiro item.
    // Estratégia simples: o desconto fica registrado no banco; no MP enviamos total já líquido
    // diminuindo proporcionalmente o primeiro item.
    const first = mpItems[0];
    const reduction = discount / 100;
    first.unit_price = Math.max(0.01, +(first.unit_price - reduction / first.quantity).toFixed(2));
  }

  const prefBody = {
    items: mpItems,
    external_reference: order.id,
    back_urls: {
      success: `${siteUrl}/pagamento-sucesso.html?order=${order.id}`,
      pending: `${siteUrl}/pagamento-pendente.html?order=${order.id}`,
      failure: `${siteUrl}/pagamento-falha.html?order=${order.id}`,
    },
    // NÃO definir notification_url aqui: quando presente na preferência ele
    // tem precedência sobre o webhook do painel e é assinado com outra chave,
    // quebrando a validação HMAC. Deixamos as notificações passarem pelo
    // webhook configurado no painel MP (mesma URL, assinado com o secret do
    // painel que a função webhook-mp valida).
    payer: { email: user.email ?? undefined },
    metadata: { order_id: order.id, user_id: user.id },
  };

  const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(prefBody),
  });

  if (!prefRes.ok) {
    const text = await prefRes.text();
    return json({ error: 'MercadoPago recusou a preferência.', detail: text }, 502);
  }
  const pref = await prefRes.json();

  // 7) Guardar id da preferência no pedido (para correlacionar webhook → order)
  await supabase
    .from('orders')
    .update({ mp_preference_id: pref.id })
    .eq('id', order.id);

  return json({
    order_id: order.id,
    preference_id: pref.id,
    init_point: pref.init_point,
    sandbox_init_point: pref.sandbox_init_point,
  });
});

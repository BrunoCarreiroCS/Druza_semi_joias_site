// Cria um pedido em uma transacao protegida pelo banco. Preco, desconto,
// frete, snapshot dos itens e reserva de estoque nunca vem do navegador.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  corsHeaders,
  preflight,
  rejectDisallowedOrigin,
} from '../_shared/cors.ts';
import { consumeDurableLimit, rateLimit } from '../_shared/rate-limit.ts';
import { isUuid } from '../_shared/payment.ts';
import {
  hasSupabaseConfig,
  SUPABASE_ADMIN_KEY,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
} from '../_shared/supabase-env.ts';
const STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT',
  'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
  'RR', 'SC', 'SP', 'SE', 'TO',
]);

interface BodyItem {
  slug: string;
  qty: number;
}

interface AddressInput {
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  label?: string;
}

interface RequestBody {
  items: BodyItem[];
  address_id?: string;
  address?: AddressInput;
  coupon?: string;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : '';
}

function normalizeAddress(value: unknown): AddressInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const address: AddressInput = {
    recipient: cleanText(raw.recipient, 120),
    cep: cleanText(raw.cep, 16).replace(/\D/g, ''),
    street: cleanText(raw.street, 160),
    number: cleanText(raw.number, 20),
    complement: cleanText(raw.complement, 120) || undefined,
    neighborhood: cleanText(raw.neighborhood, 80) || undefined,
    city: cleanText(raw.city, 80),
    state: cleanText(raw.state, 2).toUpperCase(),
    label: cleanText(raw.label, 40) || 'Endereco',
  };

  if (address.recipient.length < 3 || address.street.length < 3
      || !address.number || address.city.length < 2
      || !/^\d{8}$/.test(address.cep) || !STATES.has(address.state)) {
    return null;
  }
  return address;
}

function publicOrderError(error: { message?: string } | null): { message: string; status: number } {
  const code = error?.message ?? '';
  if (code.includes('profile_incomplete')) {
    return { message: 'Complete seus dados obrigatorios em Minha conta.', status: 409 };
  }
  if (code.includes('insufficient_stock')) {
    return { message: 'Um dos produtos ficou sem estoque.', status: 409 };
  }
  if (code.includes('inactive_product') || code.includes('invalid_product')) {
    return { message: 'Um dos produtos nao esta mais disponivel.', status: 409 };
  }
  if (code.includes('active_reservation_limit')) {
    return { message: 'Existem pagamentos em aberto. Conclua ou aguarde a expiracao.', status: 429 };
  }
  if (code.includes('address_not_found')) {
    return { message: 'Endereco nao encontrado.', status: 400 };
  }
  return { message: 'Nao foi possivel criar o pedido.', status: 500 };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const originError = rejectDisallowedOrigin(req);
  if (originError) return originError;
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao permitido.' }, 405);

  const cors = corsHeaders(req);
  const burst = rateLimit(req, cors, { limit: 20, windowMs: 60_000 });
  if (burst) return burst;
  if (!hasSupabaseConfig()) {
    return json(req, { error: 'Servico temporariamente indisponivel.' }, 503);
  }

  const length = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 64_000) {
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
  if (userError || !userResult.user) {
    return json(req, { error: 'Sessao invalida.' }, 401);
  }
  const user = userResult.user;

  const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const allowed = await consumeDurableLimit(
      admin as any, 'create-order:user', user.id, 20, 900,
    );
    if (!allowed) {
      return json(req, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' }, 429);
    }
  } catch {
    return json(req, { error: 'Servico temporariamente indisponivel.' }, 503);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'JSON invalido.' }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return json(req, { error: 'Carrinho invalido.' }, 400);
  }
  const items = body.items.map((item) => ({
    slug: cleanText(item?.slug, 80),
    qty: Number(item?.qty),
  }));
  if (items.some((item) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.slug)
      || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10)) {
    return json(req, { error: 'Item invalido no carrinho.' }, 400);
  }

  let addressId = '';
  if (body.address_id !== undefined) {
    if (!isUuid(body.address_id)) {
      return json(req, { error: 'Endereco invalido.' }, 400);
    }
    const { data: address, error } = await userClient
      .from('addresses')
      .select('id')
      .eq('id', body.address_id)
      .maybeSingle();
    if (error || !address) {
      return json(req, { error: 'Endereco nao encontrado.' }, 400);
    }
    addressId = address.id;
  } else {
    const address = normalizeAddress(body.address);
    if (!address) return json(req, { error: 'Endereco incompleto ou invalido.' }, 400);

    const { data: inserted, error } = await userClient
      .from('addresses')
      .insert({
        user_id: user.id,
        label: address.label,
        recipient: address.recipient,
        cep: address.cep,
        street: address.street,
        number: address.number,
        complement: address.complement ?? null,
        neighborhood: address.neighborhood ?? null,
        city: address.city,
        state: address.state,
      })
      .select('id')
      .single();
    if (error || !inserted) {
      const limitReached = error?.message?.includes('address_limit_reached');
      return json(req, {
        error: limitReached
          ? 'Limite de enderecos atingido. Remova um endereco antigo.'
          : 'Nao foi possivel salvar o endereco.',
      }, limitReached ? 409 : 400);
    }
    addressId = inserted.id;
  }

  const { data, error } = await admin.rpc('create_reserved_order', {
    p_user_id: user.id,
    p_address_id: addressId,
    p_items: items,
    p_coupon_code: cleanText(body.coupon, 40) || null,
  });
  if (error || !data || typeof data !== 'object') {
    const publicError = publicOrderError(error);
    return json(req, { error: publicError.message }, publicError.status);
  }

  const result = data as Record<string, unknown>;
  return json(req, {
    order_id: result.order_id,
    total_cents: result.total_cents,
    reservation_expires_at: result.reservation_expires_at,
  }, 201);
});

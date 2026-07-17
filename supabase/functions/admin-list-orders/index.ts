// deno-lint-ignore-file no-explicit-any
import { AdminAuthError, requireAdmin } from '../_shared/require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

interface RequestBody {
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

const STATUSES = new Set([
  'pending', 'processing', 'paid', 'shipped',
  'delivered', 'canceled', 'refunded',
]);

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function normalizeDate(value: unknown, endOfDay = false): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) return null;
  const raw = value.trim();
  const source = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : raw;
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const originError = rejectDisallowedOrigin(req);
  if (originError) return originError;
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao permitido.' }, 405);

  const limited = rateLimit(req, corsHeaders(req), { limit: 60 });
  if (limited) return limited;

  let context;
  try {
    context = await requireAdmin(req);
  } catch (error) {
    if (error instanceof AdminAuthError) return json(req, { error: error.message }, error.status);
    return json(req, { error: 'Erro de autorizacao.' }, 500);
  }

  let body: RequestBody = {};
  try {
    body = await req.json();
  } catch {
    // Filtros sao opcionais.
  }

  const statusFilter = String(body.status ?? '').trim();
  if (statusFilter && !STATUSES.has(statusFilter)) {
    return json(req, { error: 'Status invalido.' }, 400);
  }
  const search = String(body.search ?? '').trim().toLowerCase().slice(0, 254);
  const dateFrom = body.date_from ? normalizeDate(body.date_from) : null;
  const dateTo = body.date_to ? normalizeDate(body.date_to, true) : null;
  if ((body.date_from && !dateFrom) || (body.date_to && !dateTo)) {
    return json(req, { error: 'Data invalida.' }, 400);
  }
  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    return json(req, { error: 'Intervalo de datas invalido.' }, 400);
  }

  const hasSearch = search.length > 0;
  const limit = hasSearch
    ? 200
    : Math.min(Math.max(Math.trunc(Number(body.limit) || 50), 1), 200);
  const offset = hasSearch ? 0 : Math.max(Math.trunc(Number(body.offset) || 0), 0);
  let query = context.admin
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (statusFilter) query = query.eq('status', statusFilter);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data: orders, error, count } = await query;
  if (error) return json(req, { error: 'Falha ao listar pedidos.' }, 500);

  const userIds = [...new Set((orders ?? []).map((order: any) => String(order.user_id)))];
  const emailById: Record<string, string> = {};
  await Promise.all(userIds.map(async (userId) => {
    const { data } = await context.admin.auth.admin.getUserById(userId);
    if (data?.user?.email) emailById[userId] = data.user.email;
  }));

  let result = (orders ?? []).map((order: any) => ({
    ...order,
    customer_email: emailById[order.user_id] ?? null,
  }));
  if (hasSearch) {
    result = result.filter((order: any) => (
      String(order.id).toLowerCase().includes(search)
      || String(order.customer_email ?? '').toLowerCase().includes(search)
    ));
  }

  return json(req, {
    orders: result,
    total: hasSearch ? result.length : (count ?? result.length),
  });
});

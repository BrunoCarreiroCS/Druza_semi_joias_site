// =====================================================================
// DRUZA — Edge Function: admin-list-orders
//
// Lista pedidos de TODOS os clientes (o cliente comum só vê os próprios,
// via RLS, em conta.html). Suporta filtro por status e busca por id do
// pedido / e-mail do cliente. Acesso restrito a quem está na tabela
// public.admins — ver _shared/require-admin.ts.
//
// Deploy:  supabase functions deploy admin-list-orders
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { requireAdmin, AdminAuthError } from '../_shared/require-admin.ts';
import { CORS } from '../_shared/cors.ts';
import { rateLimit } from '../_shared/rate-limit.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface ReqBody {
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

function normalizeDateFilter(value: unknown, endOfDay = false): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const limited = rateLimit(req, CORS, { limit: 60 });
  if (limited) return limited;

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) return json({ error: err.message }, err.status);
    return json({ error: 'Erro de autorização.' }, 500);
  }
  const { admin } = ctx;

  let body: ReqBody = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (body.date_from) {
    dateFrom = normalizeDateFilter(body.date_from);
    if (!dateFrom) return json({ error: 'date_from invÃ¡lida.' }, 400);
  }
  if (body.date_to) {
    dateTo = normalizeDateFilter(body.date_to, true);
    if (!dateTo) return json({ error: 'date_to invÃ¡lida.' }, 400);
  }
  if (dateFrom && dateTo && new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
    return json({ error: 'date_from deve ser anterior ou igual a date_to.' }, 400);
  }

  const hasSearch = !!(body.search || '').trim();
  // A busca por id/e-mail é aplicada em memória (o e-mail vem de
  // auth.users, fora do alcance de um filtro do PostgREST) — então,
  // quando há busca, ignora a paginação normal e varre uma janela maior
  // pra não perder resultado que estaria só numa página seguinte.
  const limit = hasSearch ? 500 : Math.min(Math.max(Number(body.limit) || 50, 1), 200);
  const offset = hasSearch ? 0 : Math.max(Number(body.offset) || 0, 0);

  let query = admin
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (body.status) query = query.eq('status', body.status);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data: orders, error, count } = await query;
  if (error) return json({ error: 'Falha ao listar pedidos.', detail: error.message }, 500);

  // E-mail do cliente vive em auth.users (fora do schema public, não dá
  // pra fazer join direto via PostgREST) — busca só dos usuários únicos
  // presentes nesta página de resultados.
  const userIds = [...new Set((orders || []).map((o: any) => o.user_id))];
  const emailById: Record<string, string> = {};
  await Promise.all(userIds.map(async (uid) => {
    const { data } = await admin.auth.admin.getUserById(uid as string);
    if (data?.user?.email) emailById[uid as string] = data.user.email;
  }));

  let result = (orders || []).map((o: any) => ({
    ...o,
    customer_email: emailById[o.user_id] || null,
  }));

  const search = (body.search || '').trim().toLowerCase();
  if (search) {
    result = result.filter((o: any) =>
      String(o.id).toLowerCase().includes(search) ||
      (o.customer_email || '').toLowerCase().includes(search)
    );
  }

  // Com busca ativa, o "count" do banco reflete só o filtro de status
  // (a busca em si é pós-processada em memória), então o total certo
  // pra exibir é o tamanho da lista já filtrada.
  return json({ orders: result, total: hasSearch ? result.length : (count ?? result.length) });
});

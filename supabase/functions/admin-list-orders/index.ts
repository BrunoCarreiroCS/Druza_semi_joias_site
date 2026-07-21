// deno-lint-ignore-file no-explicit-any
// Lista de pedidos do painel.
//
// A busca por nome, e-mail e telefone e resolvida no banco (via
// public.admin_find_user_ids) antes da consulta, e nao filtrando a
// pagina ja carregada — assim um pedido antigo nao some da busca so
// porque ficou fora das primeiras 200 linhas.

import { AdminRequestError, serveAdmin } from '../_shared/admin-endpoint.ts';

interface RequestBody {
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  /** 'sem_rastreio' restringe aos pagos que ainda nao foram postados. */
  shipping?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

const STATUSES = new Set([
  'pending', 'processing', 'paid', 'shipped',
  'delivered', 'canceled', 'refunded',
]);

const SORTS: Record<string, { column: string; ascending: boolean }> = {
  recentes: { column: 'created_at', ascending: false },
  antigos: { column: 'created_at', ascending: true },
  maior_valor: { column: 'total_cents', ascending: false },
  menor_valor: { column: 'total_cents', ascending: true },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDate(value: unknown, endOfDay = false): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) return null;
  const raw = value.trim();
  const source = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : raw;
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  const statusFilter = String(body.status ?? '').trim();
  if (statusFilter && !STATUSES.has(statusFilter)) {
    throw new AdminRequestError('Status inválido.');
  }

  const sort = SORTS[String(body.sort ?? 'recentes')];
  if (!sort) throw new AdminRequestError('Ordenação inválida.');

  const dateFrom = body.date_from ? normalizeDate(body.date_from) : null;
  const dateTo = body.date_to ? normalizeDate(body.date_to, true) : null;
  if ((body.date_from && !dateFrom) || (body.date_to && !dateTo)) {
    throw new AdminRequestError('Data inválida.');
  }
  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw new AdminRequestError('O período informado começa depois de terminar.');
  }

  const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 50), 1), 200);
  const offset = Math.max(Math.trunc(Number(body.offset) || 0), 0);

  let query = context.admin
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order(sort.column, { ascending: sort.ascending })
    .range(offset, offset + limit - 1);

  if (statusFilter) query = query.eq('status', statusFilter);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  if (body.shipping === 'sem_rastreio') {
    query = query.eq('status', 'paid').is('tracking_code', null);
  }

  const search = String(body.search ?? '').trim().slice(0, 254);
  if (search) {
    if (UUID_RE.test(search)) {
      query = query.eq('id', search);
    } else if (/^[0-9a-f-]{4,}$/i.test(search)) {
      // Numero curto do pedido: o painel mostra os 8 primeiros caracteres.
      // A comparacao acontece no banco, porque `ilike` nao existe para uuid.
      const { data: matches, error: matchError } = await context.admin
        .rpc('admin_find_order_ids', { p_prefix: search });
      if (matchError) throw new Error(`find_order_ids_failed: ${matchError.message}`);

      const orderIds = ((matches as any[]) ?? []).map((row) => row.order_id);
      if (!orderIds.length) return { orders: [], total: 0, limit, offset };
      query = query.in('id', orderIds);
    } else {
      const { data: matches, error: matchError } = await context.admin
        .rpc('admin_find_user_ids', { p_term: search });
      if (matchError) throw new Error(`find_user_ids_failed: ${matchError.message}`);

      const userIds = ((matches as any[]) ?? []).map((row) => row.user_id);
      if (!userIds.length) return { orders: [], total: 0, limit, offset };
      query = query.in('user_id', userIds);
    }
  }

  const { data: orders, error, count } = await query;
  if (error) throw new Error(`list_orders_failed: ${error.message}`);

  const userIds = [...new Set(((orders as any[]) ?? []).map((order) => String(order.user_id)))];
  const emailById: Record<string, string> = {};
  const profileById: Record<string, { full_name: string | null; phone: string | null }> = {};

  await Promise.all([
    ...userIds.map(async (userId) => {
      const { data } = await context.admin.auth.admin.getUserById(userId);
      if (data?.user?.email) emailById[userId] = data.user.email;
    }),
    (async () => {
      if (!userIds.length) return;
      const { data } = await context.admin
        .from('profiles').select('id, full_name, phone').in('id', userIds);
      for (const profile of ((data as any[]) ?? [])) {
        profileById[profile.id] = { full_name: profile.full_name, phone: profile.phone };
      }
    })(),
  ]);

  const result = ((orders as any[]) ?? []).map((order) => ({
    ...order,
    customer_email: emailById[order.user_id] ?? null,
    customer_name: profileById[order.user_id]?.full_name ?? null,
    customer_phone: profileById[order.user_id]?.phone ?? null,
  }));

  return { orders: result, total: count ?? result.length, limit, offset };
}, { limit: 90 });

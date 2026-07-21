// deno-lint-ignore-file no-explicit-any
// Historico de movimentacoes de estoque, com filtro por produto, tipo e
// periodo. E o extrato que explica por que o saldo de hoje e o que e.

import { AdminRequestError, serveAdmin } from '../_shared/admin-endpoint.ts';
import { isUuid } from '../_shared/catalog-validation.ts';

const ALL_MOVEMENT_TYPES = new Set([
  'saldo_inicial', 'entrada', 'venda', 'reserva', 'liberacao_reserva',
  'devolucao', 'troca', 'ajuste_positivo', 'ajuste_negativo',
  'perda', 'avaria', 'inventario',
]);

interface RequestBody {
  product_id?: string;
  movement_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
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

serveAdmin<RequestBody>(async ({ body, context }) => {
  if (body.product_id && !isUuid(body.product_id)) {
    throw new AdminRequestError('Produto inválido.');
  }
  const movementType = String(body.movement_type ?? '').trim();
  if (movementType && !ALL_MOVEMENT_TYPES.has(movementType)) {
    throw new AdminRequestError('Tipo de movimentação inválido.');
  }

  const dateFrom = body.date_from ? normalizeDate(body.date_from) : null;
  const dateTo = body.date_to ? normalizeDate(body.date_to, true) : null;
  if ((body.date_from && !dateFrom) || (body.date_to && !dateTo)) {
    throw new AdminRequestError('Data inválida.');
  }

  const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 50), 1), 200);
  const offset = Math.max(Math.trunc(Number(body.offset) || 0), 0);

  let query = context.admin
    .from('inventory_movements')
    .select('*, products(id, slug, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (body.product_id) query = query.eq('product_id', body.product_id);
  if (movementType) query = query.eq('movement_type', movementType);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data, error, count } = await query;
  if (error) throw new Error(`list_inventory_failed: ${error.message}`);

  // Quem fez a movimentacao manual: so o e-mail, que e o que identifica a
  // pessoa no painel. Nada alem disso sai da tabela de usuarios.
  const adminIds = [...new Set(
    ((data as any[]) ?? []).map((row) => row.admin_user_id).filter(Boolean),
  )] as string[];
  const emailById: Record<string, string> = {};
  await Promise.all(adminIds.map(async (id) => {
    const { data: user } = await context.admin.auth.admin.getUserById(id);
    if (user?.user?.email) emailById[id] = user.user.email;
  }));

  return {
    movements: ((data as any[]) ?? []).map((row) => ({
      ...row,
      admin_email: row.admin_user_id ? (emailById[row.admin_user_id] ?? null) : null,
    })),
    total: count ?? 0,
    limit,
    offset,
  };
}, { limit: 90 });

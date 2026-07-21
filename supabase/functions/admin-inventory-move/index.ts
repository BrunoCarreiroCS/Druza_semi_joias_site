// Entrada e saida manual de estoque.
//
// Toda a regra fica em public.admin_move_inventory: trava a linha do
// produto, recusa saldo negativo, grava o lancamento no livro-razao e
// devolve o resultado anterior se a mesma chave de idempotencia chegar
// de novo (o clique duplo em "Confirmar" nao conta duas entradas).

import { AdminRequestError, logAdminAction, serveAdmin } from '../_shared/admin-endpoint.ts';
import { parseInventoryMove } from '../_shared/catalog-validation.ts';

const FRIENDLY_ERRORS: Record<string, string> = {
  insufficient_stock_for_movement:
    'Não há estoque suficiente para concluir essa saída.',
  product_not_found: 'Produto não encontrado.',
  movement_type_not_allowed: 'Tipo de movimentação inválido.',
  invalid_movement_quantity: 'A quantidade informada não é válida.',
  not_an_admin: 'Acesso restrito a administradores.',
};

serveAdmin(async ({ body, context }) => {
  const move = parseInventoryMove(body as Record<string, unknown>);

  const { data, error } = await context.admin.rpc('admin_move_inventory', {
    p_admin_user_id: context.userId,
    p_product_id: move.product_id,
    p_movement_type: move.movement_type,
    p_quantity: move.quantity,
    p_reason: move.reason,
    p_note: move.note,
    p_unit_cost_cents: move.unit_cost_cents,
    p_supplier: move.supplier,
    p_idempotency_key: move.idempotency_key,
  });

  if (error) {
    const message = error.message ?? '';
    for (const [code, friendly] of Object.entries(FRIENDLY_ERRORS)) {
      if (message.includes(code)) {
        throw new AdminRequestError(friendly, code === 'not_an_admin' ? 403 : 409);
      }
    }
    throw new Error(`inventory_move_failed: ${message}`);
  }

  const result = (data ?? {}) as Record<string, unknown>;

  // Replay do mesmo envio nao vira linha nova de auditoria: o que
  // aconteceu de fato ja foi registrado na primeira vez.
  if (result.state !== 'duplicate') {
    await logAdminAction(
      context.admin,
      context.userId,
      `inventory.${move.movement_type}`,
      'inventory_movements',
      String(result.movement_id ?? ''),
      {
        product_id: move.product_id,
        quantidade: move.quantity,
        saldo_anterior: result.quantity_before,
        saldo_novo: result.quantity_after,
        motivo: move.reason,
      },
    );
  }

  const { data: product } = await context.admin
    .from('products')
    .select('id, slug, name, stock_quantity, min_stock, low_stock')
    .eq('id', move.product_id)
    .maybeSingle();

  return { movement: result, product };
}, { limit: 40 });

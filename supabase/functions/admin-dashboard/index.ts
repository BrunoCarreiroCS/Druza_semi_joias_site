// deno-lint-ignore-file no-explicit-any
// Numeros da tela "Visão geral": contagens de catalogo, funil de pedidos,
// vendas por periodo, produtos com estoque baixo, pedidos aguardando
// envio e as ultimas movimentacoes de estoque.
//
// As contagens vem de uma unica chamada a public.admin_dashboard_metrics,
// e as listas de atalho sao limitadas a poucas linhas — a visao geral
// existe para orientar a proxima acao, nao para paginar o banco inteiro.

import { serveAdmin } from '../_shared/admin-endpoint.ts';

serveAdmin(async ({ context }) => {
  const [metrics, lowStock, awaitingShipment, recentOrders, recentMovements] = await Promise.all([
    context.admin.rpc('admin_dashboard_metrics'),
    context.admin
      .from('products')
      .select('id, slug, name, stock_quantity, min_stock')
      .eq('status', 'active')
      .eq('low_stock', true)
      .order('stock_quantity', { ascending: true })
      .limit(10),
    context.admin
      .from('orders')
      .select('id, total_cents, paid_at, tracking_code, shipping_address_snapshot')
      .eq('status', 'paid')
      .order('paid_at', { ascending: true })
      .limit(10),
    context.admin
      .from('orders')
      .select('id, status, payment_status, total_cents, created_at, tracking_code')
      .order('created_at', { ascending: false })
      .limit(8),
    context.admin
      .from('inventory_movements')
      .select('id, product_slug, movement_type, quantity_change, quantity_after, created_at, reason')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (metrics.error) throw new Error(`dashboard_metrics_failed: ${metrics.error.message}`);

  return {
    metrics: metrics.data ?? {},
    estoque_baixo: (lowStock.data as any[]) ?? [],
    aguardando_envio: (awaitingShipment.data as any[]) ?? [],
    pedidos_recentes: (recentOrders.data as any[]) ?? [],
    movimentacoes_recentes: (recentMovements.data as any[]) ?? [],
  };
}, { limit: 90 });

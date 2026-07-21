// Tira um produto do ar sem apagar nada.
//
// Produto que ja apareceu num pedido nunca pode sumir: o historico do
// pedido aponta para ele. Por isso a acao aqui e mudar a situacao —
// "inactive" (fora da loja, volta a qualquer momento) ou "archived"
// (encerrado, some ate da lista do painel).
//
// O saldo de estoque e preservado de proposito. A versao anterior desta
// funcao zerava stock_quantity ao desativar, o que apagava a contagem
// real das pecas guardadas na gaveta; agora o produto some da loja mas
// o estoque continua contado.

import { AdminRequestError, logAdminAction, serveAdmin } from '../_shared/admin-endpoint.ts';
import { isUuid } from '../_shared/catalog-validation.ts';

interface RequestBody {
  id?: string;
  status?: string;
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  if (!isUuid(body.id)) throw new AdminRequestError('Produto inválido.');

  const status = String(body.status ?? 'inactive');
  if (!['inactive', 'archived', 'active'].includes(status)) {
    throw new AdminRequestError('Situação inválida.');
  }

  const { data: current } = await context.admin
    .from('products').select('id, name, status').eq('id', body.id).maybeSingle();
  if (!current) throw new AdminRequestError('Produto não encontrado.', 404);

  const { data, error } = await context.admin
    .from('products')
    .update({ status })
    .eq('id', body.id)
    .select('id, name, status, stock_quantity')
    .maybeSingle();
  if (error || !data) throw new Error(`update_product_status_failed: ${error?.message ?? 'sem retorno'}`);

  await logAdminAction(
    context.admin,
    context.userId,
    status === 'archived' ? 'product.archive' : 'product.status_change',
    'products',
    String(body.id),
    { de: current.status, para: status },
  );

  return { product: data };
}, { limit: 30 });

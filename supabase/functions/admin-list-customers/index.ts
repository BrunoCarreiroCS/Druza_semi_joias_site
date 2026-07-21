// deno-lint-ignore-file no-explicit-any
// Clientes montados a partir dos pedidos que ja existem.
//
// Nao ha cadastro de cliente separado nem cruzamento com outra fonte: e a
// mesma informacao que cada pedido ja carrega (nome e telefone do
// perfil, e-mail do login), agrupada por pessoa. Nenhum dado novo passa
// a ser coletado por causa desta tela.

import { serveAdmin } from '../_shared/admin-endpoint.ts';

interface RequestBody {
  search?: string;
  limit?: number;
  offset?: number;
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 100), 1), 500);
  const offset = Math.max(Math.trunc(Number(body.offset) || 0), 0);

  const { data, error } = await context.admin.rpc('admin_customer_summary', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`customer_summary_failed: ${error.message}`);

  const rows = ((data as any[]) ?? []);
  const emailById: Record<string, string> = {};
  await Promise.all(rows.map(async (row) => {
    const { data: user } = await context.admin.auth.admin.getUserById(row.user_id);
    if (user?.user?.email) emailById[row.user_id] = user.user.email;
  }));

  let customers = rows.map((row) => ({
    user_id: row.user_id,
    full_name: row.full_name,
    phone: row.phone,
    email: emailById[row.user_id] ?? null,
    orders_count: Number(row.orders_count ?? 0),
    paid_count: Number(row.paid_count ?? 0),
    total_cents: Number(row.total_cents ?? 0),
    first_order_at: row.first_order_at,
    last_order_at: row.last_order_at,
  }));

  // A busca acontece depois da agregacao porque o e-mail nao mora no
  // mesmo banco das outras colunas — filtrar antes deixaria a pesquisa
  // por e-mail sem efeito.
  const search = String(body.search ?? '').trim().toLowerCase().slice(0, 120);
  if (search) {
    const digits = search.replace(/\D/g, '');
    customers = customers.filter((customer) => {
      if (String(customer.full_name ?? '').toLowerCase().includes(search)) return true;
      if (String(customer.email ?? '').toLowerCase().includes(search)) return true;
      // So compara telefone quando o termo tem digitos suficientes: com
      // menos que isso, qualquer numero casaria com todo mundo.
      return digits.length >= 4
        && String(customer.phone ?? '').replace(/\D/g, '').includes(digits);
    });
  }

  return { customers, limit, offset };
}, { limit: 60 });

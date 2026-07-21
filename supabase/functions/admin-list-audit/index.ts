// deno-lint-ignore-file no-explicit-any
// Registro das acoes administrativas: quem fez, o que fez, quando e sobre
// qual registro. Alimenta a aba "Histórico" do painel, que antes so podia
// ser consultada direto no Supabase Studio.

import { serveAdmin } from '../_shared/admin-endpoint.ts';

interface RequestBody {
  action?: string;
  limit?: number;
  offset?: number;
}

serveAdmin<RequestBody>(async ({ body, context }) => {
  const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 50), 1), 200);
  const offset = Math.max(Math.trunc(Number(body.offset) || 0), 0);

  let query = context.admin
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const action = String(body.action ?? '').trim().slice(0, 60);
  if (action && /^[a-z_.]+$/.test(action)) query = query.eq('action', action);

  const { data, error, count } = await query;
  if (error) throw new Error(`list_audit_failed: ${error.message}`);

  const adminIds = [...new Set(((data as any[]) ?? []).map((row) => row.admin_user_id))];
  const emailById: Record<string, string> = {};
  await Promise.all(adminIds.map(async (id) => {
    const { data: user } = await context.admin.auth.admin.getUserById(id);
    if (user?.user?.email) emailById[id] = user.user.email;
  }));

  return {
    entries: ((data as any[]) ?? []).map((row) => ({
      ...row,
      admin_email: emailById[row.admin_user_id] ?? null,
    })),
    total: count ?? 0,
    limit,
    offset,
  };
}, { limit: 60 });

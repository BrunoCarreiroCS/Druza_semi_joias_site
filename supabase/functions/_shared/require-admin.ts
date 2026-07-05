// =====================================================================
// DRUZA — _shared/require-admin.ts
//
// Checagem de autorização compartilhada por todas as Edge Functions
// admin-*. Nunca confia em nada vindo do corpo/headers da requisição
// além do JWT em si — quem é admin é sempre confirmado contra o banco
// (tabela public.admins), usando a service_role (a única forma de ler
// além da própria linha, já que a policy de admins é select-own).
//
// Isso centraliza a autorização num único lugar auditável, em vez de
// espalhar "se é admin, libera tudo" em política de RLS de várias
// tabelas — mesmo raciocínio já aplicado no webhook-mp (nunca confiar
// no cliente, sempre revalidar no servidor).
// =====================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export interface AdminContext {
  userId: string;
  admin: SupabaseClient;
}

// Lê o claim `aal` (assurance level) do payload do JWT. O token já foi
// validado por getUser (assinatura + expiração), então só decodificamos
// o payload para ler o claim. aal2 = 2FA verificado nesta sessão.
function readAal(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

// Lança AdminAuthError se o request não vier de um administrador com 2FA
// verificado (aal2). Camadas: (1) JWT válido, (2) presença na tabela
// admins, (3) 2FA na sessão. Só depois de tudo isso devolve o client
// service_role. É a trava REAL — não confia na UI, revalida no servidor.
export async function requireAdmin(req: Request): Promise<AdminContext> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new AdminAuthError('Não autenticado.', 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) throw new AdminAuthError('Sessão inválida.', 401);
  const userId = userData.user.id;

  const { data: row, error: adminErr } = await admin
    .from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (adminErr) throw new AdminAuthError('Falha ao verificar permissão.', 500);
  if (!row) throw new AdminAuthError('Acesso restrito a administradores.', 403);

  // Exige 2FA verificado. Um admin sem 2FA (ou que não passou pelo código
  // nesta sessão) fica em aal1 e é barrado — precisa completar a
  // verificação em duas etapas na tela de login do admin. O código de
  // erro `mfa_required` deixa a UI saber que deve pedir o token.
  const aal = readAal(jwt);
  if (aal !== 'aal2') {
    throw new AdminAuthError('mfa_required', 403);
  }

  return { userId, admin };
}

// Grava uma linha de auditoria. Chamar depois de qualquer escrita
// administrativa bem-sucedida (nunca antes — só registra o que de fato
// aconteceu).
export async function logAdminAction(
  admin: SupabaseClient,
  adminUserId: string,
  action: string,
  targetTable: string | null,
  targetId: string | null,
  detail: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await admin.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    target_table: targetTable,
    target_id: targetId,
    detail: detail ?? null,
  });
  if (error) console.error('falha ao gravar admin_audit_log', { action, targetTable, targetId, error });
}

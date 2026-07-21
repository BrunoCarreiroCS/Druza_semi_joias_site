// =====================================================================
// DRUZA — _shared/admin-endpoint.ts
//
// Envelope comum das Edge Functions admin-*. Cada uma delas repetia as
// mesmas seis etapas antes de chegar na regra de negocio: preflight,
// origem permitida, metodo, rate limit, requireAdmin e parse do JSON.
// Concentrar isso aqui garante que nenhuma rota administrativa nova
// esqueca uma das travas — a autorizacao deixa de ser algo que se
// lembra de copiar e passa a ser o caminho unico de entrada.
// =====================================================================

import {
  AdminAuthError,
  type AdminContext,
  logAdminAction,
  requireAdmin,
} from './require-admin.ts';
import { corsHeaders, preflight, rejectDisallowedOrigin } from './cors.ts';
import { rateLimit } from './rate-limit.ts';
import { AdminRequestError } from './http-error.ts';

export { AdminRequestError, logAdminAction };
export type { AdminContext };

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export interface AdminRequest<TBody> {
  req: Request;
  body: TBody;
  context: AdminContext;
}

interface ServeOptions {
  /** Teto de requisicoes por minuto por IP. */
  limit?: number;
  /** Tamanho maximo do corpo, em bytes. */
  maxBodyBytes?: number;
}

export function serveAdmin<TBody = Record<string, unknown>>(
  handler: (request: AdminRequest<TBody>) => Promise<unknown>,
  options: ServeOptions = {},
): void {
  const limit = options.limit ?? 60;
  const maxBodyBytes = options.maxBodyBytes ?? 64_000;

  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return preflight(req);

    const originError = rejectDisallowedOrigin(req);
    if (originError) return originError;

    if (req.method !== 'POST') {
      return json(req, { error: 'Metodo nao permitido.' }, 405);
    }

    const limited = rateLimit(req, corsHeaders(req), { limit });
    if (limited) return limited;

    const length = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBodyBytes) {
      return json(req, { error: 'Requisicao grande demais.' }, 413);
    }

    let context: AdminContext;
    try {
      context = await requireAdmin(req);
    } catch (error) {
      if (error instanceof AdminAuthError) {
        return json(req, { error: error.message }, error.status);
      }
      return json(req, { error: 'Erro de autorizacao.' }, 500);
    }

    let body: TBody;
    try {
      const text = await req.text();
      body = (text ? JSON.parse(text) : {}) as TBody;
    } catch {
      return json(req, { error: 'JSON invalido.' }, 400);
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return json(req, { error: 'JSON invalido.' }, 400);
    }

    try {
      const result = await handler({ req, body, context });
      return json(req, result ?? { ok: true });
    } catch (error) {
      if (error instanceof AdminRequestError) {
        return json(req, { error: error.message }, error.status);
      }
      // Nunca devolve a mensagem crua do banco: ela pode carregar nome de
      // coluna, constraint e trecho de payload.
      console.error('admin endpoint failure', {
        path: new URL(req.url).pathname,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return json(req, { error: 'Não foi possível concluir a operação.' }, 500);
    }
  });
}

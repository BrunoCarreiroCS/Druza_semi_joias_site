// =====================================================================
// DRUZA — _shared/rate-limit.ts
//
// Rate limiting por IP (janela fixa, em memória). Mitiga brute-force e
// abuso das Edge Functions chamadas pelo navegador.
//
// Honestidade sobre o alcance: o contador vive na memória do isolate —
// zera em cold start e não é compartilhado entre instâncias. Ou seja, é
// um AMORTECEDOR (barra rajadas óbvias), não um limite exato global.
// Para limite forte de verdade, o upgrade futuro é persistir em tabela
// ou usar um serviço dedicado (ver docs/SEGURANCA.md §4).
//
// O webhook-mp NÃO usa isto de propósito: o MercadoPago manda rajadas
// legítimas de vários IPs e um falso-positivo atrasaria confirmação de
// pagamento (que já é protegida pela re-consulta autenticada na API).
// =====================================================================

interface Bucket {
  count: number;
  reset: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_IPS = 5000; // teto de memória; ao passar, limpa expirados

function clientIp(req: Request): string {
  // Primeiro IP do X-Forwarded-For (preenchido pelo gateway do Supabase).
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0].trim() || 'unknown';
}

function sweep(now: number): void {
  for (const [key, b] of buckets) {
    if (now > b.reset) buckets.delete(key);
  }
}

// Retorna uma Response 429 se o IP estourou o limite na janela; senão
// null (siga o fluxo normal). `cors` entra nos headers do 429 para o
// navegador conseguir ler o erro.
export function rateLimit(
  req: Request,
  cors: Record<string, string>,
  opts?: { limit?: number; windowMs?: number },
): Response | null {
  const limit = opts?.limit ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_IPS) sweep(now);

  const ip = clientIp(req);
  const bucket = buckets.get(ip);

  if (!bucket || now > bucket.reset) {
    buckets.set(ip, { count: 1, reset: now + windowMs });
    return null;
  }

  bucket.count++;
  if (bucket.count <= limit) return null;

  const retryAfterSec = Math.max(1, Math.ceil((bucket.reset - now) / 1000));
  return new Response(
    JSON.stringify({ error: 'Muitas requisições. Aguarde alguns instantes e tente novamente.' }),
    {
      status: 429,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}

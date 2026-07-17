interface Bucket {
  count: number;
  reset: number;
}

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_IPS = 5000;

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.reset) buckets.delete(key);
  }
}

function enforceCapacity(): void {
  while (buckets.size >= MAX_TRACKED_IPS) {
    const oldestKey = buckets.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    buckets.delete(oldestKey);
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Amortece rajadas no isolate. O limite global fica no Postgres abaixo.
export function rateLimit(
  req: Request,
  cors: Record<string, string>,
  opts?: { limit?: number; windowMs?: number },
): Response | null {
  const limit = opts?.limit ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();

  const key = clientIp(req);
  if (!buckets.has(key) && buckets.size >= MAX_TRACKED_IPS) {
    sweep(now);
    enforceCapacity();
  }
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= limit) return null;

  return new Response(JSON.stringify({
    error: 'Muitas requisicoes. Aguarde alguns instantes e tente novamente.',
  }), {
    status: 429,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(1, Math.ceil((bucket.reset - now) / 1000))),
    },
  });
}

export async function consumeDurableLimit(
  admin: RpcClient,
  scope: string,
  rawKey: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const keyHash = await sha256Hex(rawKey);
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error('rate_limit_unavailable');
  return data === true;
}

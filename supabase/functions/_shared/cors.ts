const BUILTIN_ORIGINS = new Set([
  'https://druza.com.br',
  'https://www.druza.com.br',
  'https://brunocarreirocs.github.io',
]);

function configuredOrigins(): Set<string> {
  const configured = [
    Deno.env.get('ALLOWED_ORIGINS') ?? '',
    Deno.env.get('ALLOWED_ORIGIN') ?? '',
  ]
    .join(',')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return new Set([...BUILTIN_ORIGINS, ...configured]);
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true;
  return configuredOrigins().has(origin.replace(/\/$/, ''));
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (origin && isAllowedOrigin(req)) {
    headers['Access-Control-Allow-Origin'] = origin.replace(/\/$/, '');
  }
  return headers;
}

export function rejectDisallowedOrigin(req: Request): Response | null {
  if (isAllowedOrigin(req)) return null;
  return new Response(JSON.stringify({ error: 'Origem nao permitida.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
  });
}

export function preflight(req: Request): Response {
  const rejected = rejectDisallowedOrigin(req);
  if (rejected) return rejected;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

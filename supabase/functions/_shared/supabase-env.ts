function namedKey(variable: string): string {
  const raw = Deno.env.get(variable) ?? '';
  if (!raw) return '';
  try {
    const keys = JSON.parse(raw) as Record<string, unknown>;
    const name = Deno.env.get('SUPABASE_API_KEY_NAME')?.trim() || 'default';
    return typeof keys[name] === 'string' ? keys[name] : '';
  } catch {
    return '';
  }
}

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

export const SUPABASE_PUBLIC_KEY =
  namedKey('SUPABASE_PUBLISHABLE_KEYS')
  || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  || Deno.env.get('SUPABASE_ANON_KEY')
  || '';

export const SUPABASE_ADMIN_KEY =
  namedKey('SUPABASE_SECRET_KEYS')
  || Deno.env.get('SUPABASE_SECRET_KEY')
  || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || '';

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY && SUPABASE_ADMIN_KEY);
}

export function hasSupabaseAdminConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ADMIN_KEY);
}

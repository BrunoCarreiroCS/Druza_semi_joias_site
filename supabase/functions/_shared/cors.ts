// =====================================================================
// DRUZA — _shared/cors.ts
//
// Cabeçalhos CORS compartilhados por todas as Edge Functions chamadas
// pelo navegador (create-preference + admin-*). O webhook-mp não usa
// CORS (é servidor→servidor, o MercadoPago não é um navegador).
//
// Camada de segurança: em produção, restrinja a origem com
//   supabase secrets set ALLOWED_ORIGIN=https://druza.com.br
// e redeploy das functions. Sem a env definida, cai em '*' (modo de
// desenvolvimento — necessário enquanto o site roda via localhost/ngrok
// com URL que muda). CORS aqui é defesa em profundidade: a autorização
// real continua sendo o JWT + tabela admins + aal2 (require-admin.ts)
// e o recálculo server-side de preços (create-preference).
// =====================================================================

const ALLOWED_ORIGIN = (Deno.env.get('ALLOWED_ORIGIN') ?? '').trim();

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

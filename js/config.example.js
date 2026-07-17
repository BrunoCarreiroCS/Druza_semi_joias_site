/* Exemplo para outro projeto. A versao publicada e js/config.public.js.
   URL, publishable/anon key, MP Public Key e Turnstile Site Key sao
   credenciais publicas. Service role, MP Access Token e secrets de webhook
   pertencem somente ao Supabase Edge Functions. */
window.DRUZA_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'sua-chave-publica-aqui',
  MP_PUBLIC_KEY: 'sua-public-key-mercado-pago-aqui',
  TURNSTILE_SITE_KEY: ''
});

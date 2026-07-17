/* Somente chaves publicas para uso no navegador.
   Nunca adicione service_role, MP_ACCESS_TOKEN ou webhook secrets aqui. */
window.DRUZA_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://hqkpgghlbwincahfwkem.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Iy7-iaIsXW-6ajGiMqLu9Q_PSkKMcOP',
  MP_PUBLIC_KEY: 'TEST-1028309d-8cb1-4c59-829b-0dd36c5e2116',
  // Preencha depois de habilitar o Turnstile no Supabase Auth.
  TURNSTILE_SITE_KEY: ''
});

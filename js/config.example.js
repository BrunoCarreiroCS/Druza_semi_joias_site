/* =====================================================================
   DRUZA — config.example.js
   COPIE este arquivo para js/config.js e preencha com os dados do SEU
   projeto Supabase (Project Settings → API).

   A "anon key" (chave pública/anon) é SEGURA no navegador: o que protege
   os dados é o Row Level Security (RLS) definido em db/schema.sql.
   NUNCA coloque aqui a "service_role key" — ela ignora o RLS e só pode
   viver no servidor (Fase 4d).

   js/config.js está no .gitignore para não vazar no repositório.
   ===================================================================== */
window.DRUZA_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'sua-anon-key-publica-aqui',
  // Public Key do MercadoPago (painel MP → Credenciais) — usada pelo
  // Payment Brick no checkout. Também é segura no navegador, diferente
  // do Access Token. Ver docs/MERCADOPAGO-SETUP.md.
  MP_PUBLIC_KEY: 'sua-public-key-mercadopago-aqui'
};

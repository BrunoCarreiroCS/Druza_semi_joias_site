/* =====================================================================
   DRUZA — auth.js
   Camada de autenticação sobre o Supabase. Requer, ANTES deste script:
     <script src="js/config.js"></script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   Expõe window.DruzaAuth com as funções usadas pelas páginas.
   ===================================================================== */
(function () {
  'use strict';

  const cfg = window.DRUZA_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('SEU-PROJETO')) {
    console.warn('[DruzaAuth] config.js ausente ou não preenchido. Copie js/config.example.js → js/config.js e preencha SUPABASE_URL e SUPABASE_ANON_KEY.');
  }
  if (!window.supabase) {
    console.error('[DruzaAuth] SDK do Supabase não carregado. Inclua o <script> do CDN antes de auth.js.');
  }

  const client = window.supabase && cfg
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  /* ----------------------- Helpers de UI ----------------------- */
  function mapError(error) {
    if (!error) return null;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('invalid login')) return 'E-mail ou senha incorretos.';
    if (msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.';
    if (msg.includes('already registered') || msg.includes('already exists')) return 'Este e-mail já tem cadastro. Tente entrar ou recuperar a senha.';
    if (msg.includes('password should be at least')) return 'A senha precisa ter no mínimo 8 caracteres.';
    if (msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (msg.includes('redirect')) return 'Erro de configuração de URL de redirecionamento. Verifique as Redirect URLs no Supabase.';
    return error.message || 'Ocorreu um erro. Tente novamente.';
  }

  function baseUrl() {
    // Mantém o caminho da pasta, para funcionar em subdiretório ou domínio raiz.
    const path = window.location.pathname.replace(/[^/]*$/, '');
    return window.location.origin + path;
  }

  /* ----------------------- Cadastro ----------------------- */
  async function signUp({ fullName, email, phone, password, marketingConsent }) {
    if (!client) return { error: 'Configuração ausente.' };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: baseUrl() + 'login.html',
        data: {
          full_name: fullName,
          phone: phone || null,
          marketing_consent: !!marketingConsent
        }
      }
    });
    return { data, error: mapError(error) };
  }

  /* ----------------------- Login ----------------------- */
  async function signIn({ email, password }) {
    if (!client) return { error: 'Configuração ausente.' };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return { data, error: mapError(error) };
  }

  /* ----------------------- Logout ----------------------- */
  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  /* --------------- Esqueci minha senha (envia e-mail) --------------- */
  async function requestPasswordReset(email) {
    if (!client) return { error: 'Configuração ausente.' };
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: baseUrl() + 'redefinir-senha.html'
    });
    return { error: mapError(error) };
  }

  /* --------------- Redefinir senha (após clicar no link) --------------- */
  async function updatePassword(newPassword) {
    if (!client) return { error: 'Configuração ausente.' };
    const { error } = await client.auth.updateUser({ password: newPassword });
    return { error: mapError(error) };
  }

  /* ----------------------- Sessão ----------------------- */
  async function getSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session;
  }

  async function getUser() {
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data.user;
  }

  // Protege páginas de conta: redireciona para login se não autenticado.
  async function requireAuth(redirectTo) {
    const session = await getSession();
    if (!session) {
      const target = redirectTo || 'login.html';
      const next = encodeURIComponent(window.location.pathname.split('/').pop());
      window.location.replace(target + '?next=' + next);
      return null;
    }
    return session;
  }

  function onAuthChange(callback) {
    if (!client) return;
    client.auth.onAuthStateChange((event, session) => callback(event, session));
  }

  /* ----------------------- Perfil + dados ----------------------- */
  async function getProfile() {
    if (!client) return { error: 'Configuração ausente.' };
    const user = await getUser();
    if (!user) return { error: 'Não autenticado.' };
    const { data, error } = await client
      .from('profiles').select('*').eq('id', user.id).single();
    return { data, error: mapError(error) };
  }

  async function updateProfile(fields) {
    if (!client) return { error: 'Configuração ausente.' };
    const user = await getUser();
    if (!user) return { error: 'Não autenticado.' };
    const { data, error } = await client
      .from('profiles').update(fields).eq('id', user.id).select().single();
    return { data, error: mapError(error) };
  }

  async function listAddresses() {
    if (!client) return { data: [], error: 'Configuração ausente.' };
    const { data, error } = await client
      .from('addresses').select('*').order('is_default', { ascending: false });
    return { data: data || [], error: mapError(error) };
  }

  async function listOrders() {
    if (!client) return { data: [], error: 'Configuração ausente.' };
    const { data, error } = await client
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });
    return { data: data || [], error: mapError(error) };
  }

  /* --------------- Chamada de Edge Functions autenticada --------------- */
  // Encaminha o JWT do user no header Authorization para que a função
  // possa identificar quem chamou e aplicar políticas RLS sobre o banco.
  async function invokeFunction(name, payload) {
    if (!client) return { error: 'Configuração ausente.' };
    const session = await getSession();
    if (!session) return { error: 'Não autenticado.' };
    try {
      const url = cfg.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/' + name;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': cfg.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload || {}),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        return { error: (data && (data.error || data.message)) || 'Erro na função: ' + res.status, data };
      }
      return { data, error: null };
    } catch (err) {
      return { error: err.message || 'Falha de rede ao chamar função.' };
    }
  }

  window.DruzaAuth = {
    client,
    signUp, signIn, signOut,
    requestPasswordReset, updatePassword,
    getSession, getUser, requireAuth, onAuthChange,
    getProfile, updateProfile, listAddresses, listOrders,
    invokeFunction
  };
})();

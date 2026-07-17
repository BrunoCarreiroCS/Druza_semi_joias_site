/* =====================================================================
   DRUZA - auth.js
   Camada de autenticacao sobre o Supabase.

   Requer, antes deste script:
     <script src="js/config.js"></script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.js" integrity="..." crossorigin="anonymous"></script>

   Importante: senha fica somente no Supabase Auth. Este arquivo nunca grava
   senha em tabelas publicas como profiles.
   ===================================================================== */
(function () {
  'use strict';

  const cfg = window.DRUZA_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('SEU-PROJETO')) {
    console.warn('[DruzaAuth] config.js ausente ou nao preenchido. Copie js/config.example.js -> js/config.js e preencha SUPABASE_URL e SUPABASE_ANON_KEY.');
  }
  if (!window.supabase) {
    console.error('[DruzaAuth] SDK do Supabase nao carregado. Inclua o <script> do CDN antes de auth.js.');
  }

  const client = window.supabase && cfg
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PASSWORD_SYMBOL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

  function mapError(error) {
    if (!error) return null;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('invalid login')) return 'E-mail ou senha incorretos.';
    if (msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.';
    if (msg.includes('already registered') || msg.includes('already exists')) return 'Este e-mail ja tem cadastro. Tente entrar ou recuperar a senha.';
    if (msg.includes('password should be at least')) return 'A senha precisa ter no minimo 8 caracteres.';
    if (msg.includes('weak_password') || msg.includes('weak password')) return 'A senha nao atende aos requisitos de seguranca.';
    if (msg.includes('profile_phone_format')) return 'Informe um telefone brasileiro valido com DDD.';
    if (msg.includes('profile_birth_date_age')) return 'Para criar conta, e preciso ter 18 anos ou mais.';
    if (msg.includes('profile_required')) return 'Preencha todos os dados obrigatorios.';
    if (msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (msg.includes('redirect')) return 'Erro de configuracao de URL de redirecionamento. Verifique as Redirect URLs no Supabase.';
    return error.message || 'Ocorreu um erro. Tente novamente.';
  }

  function baseUrl() {
    const path = window.location.pathname.replace(/[^/]*$/, '');
    return window.location.origin + path;
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    return EMAIL_RE.test(normalizeEmail(email));
  }

  function normalizePhoneBR(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      digits = digits.slice(2);
    }
    if (!/^[1-9][1-9]\d{8,9}$/.test(digits)) return null;
    return '+55' + digits;
  }

  function formatPhoneBR(value) {
    const normalized = normalizePhoneBR(value);
    if (!normalized) return String(value || '').trim();
    const d = normalized.replace(/^\+55/, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  }

  function parseBirthDate(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parts = raw.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (
      date.getFullYear() !== parts[0] ||
      date.getMonth() !== parts[1] - 1 ||
      date.getDate() !== parts[2]
    ) return null;
    return date;
  }

  function adultCutoffDate() {
    const today = new Date();
    return new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  }

  function maxAdultBirthDate() {
    const cutoff = adultCutoffDate();
    return cutoff.getFullYear() + '-' +
      String(cutoff.getMonth() + 1).padStart(2, '0') + '-' +
      String(cutoff.getDate()).padStart(2, '0');
  }

  function isAdultBirthDate(value) {
    const date = parseBirthDate(value);
    return !!date && date <= adultCutoffDate();
  }

  function passwordPolicyErrors(password, context) {
    const value = String(password || '');
    const errors = [];
    if (value.length < 8) errors.push('A senha precisa ter no minimo 8 caracteres.');
    if (value.length > 72) errors.push('A senha deve ter no maximo 72 caracteres.');
    if (!/[a-z]/.test(value)) errors.push('Inclua pelo menos uma letra minuscula.');
    if (!/[A-Z]/.test(value)) errors.push('Inclua pelo menos uma letra maiuscula.');
    if (!/\d/.test(value)) errors.push('Inclua pelo menos um numero.');
    if (!PASSWORD_SYMBOL_RE.test(value)) errors.push('Inclua pelo menos um simbolo.');
    if (/\s/.test(value)) errors.push('Nao use espacos na senha.');

    const ctx = context || {};
    const lowered = value.toLowerCase();
    const emailLocal = normalizeEmail(ctx.email).split('@')[0];
    const phoneDigits = String(ctx.phone || '').replace(/\D/g, '');
    if (emailLocal && emailLocal.length >= 4 && lowered.includes(emailLocal)) {
      errors.push('Nao use parte do e-mail na senha.');
    }
    if (phoneDigits.length >= 8 && value.includes(phoneDigits.slice(-8))) {
      errors.push('Nao use o telefone na senha.');
    }
    return errors;
  }

  async function signUp({ fullName, email, phone, birthDate, password, marketingConsent }) {
    if (!client) return { error: 'Configuracao ausente.' };
    const safeName = normalizeName(fullName);
    const safeEmail = normalizeEmail(email);
    const safePhone = normalizePhoneBR(phone);
    const safeBirthDate = String(birthDate || '').trim();
    if (safeName.length < 3) return { error: 'Informe seu nome completo.' };
    if (!isValidEmail(safeEmail)) return { error: 'Informe um e-mail valido.' };
    if (!safePhone) return { error: 'Informe um telefone brasileiro valido com DDD.' };
    if (!isAdultBirthDate(safeBirthDate)) return { error: 'Para criar conta, e preciso ter 18 anos ou mais.' };
    const passwordErrors = passwordPolicyErrors(password, { email: safeEmail, phone: safePhone });
    if (passwordErrors.length) return { error: passwordErrors[0] };

    const { data, error } = await client.auth.signUp({
      email: safeEmail,
      password,
      options: {
        emailRedirectTo: baseUrl() + 'login.html',
        data: {
          full_name: safeName,
          phone: safePhone,
          birth_date: safeBirthDate,
          marketing_consent: !!marketingConsent
        }
      }
    });
    return { data, error: mapError(error) };
  }

  async function signIn({ email, password }) {
    if (!client) return { error: 'Configuracao ausente.' };
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password
    });
    return { data, error: mapError(error) };
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  async function requestPasswordReset(email) {
    if (!client) return { error: 'Configuracao ausente.' };
    const safeEmail = normalizeEmail(email);
    if (!isValidEmail(safeEmail)) return { error: 'Informe um e-mail valido.' };
    const { error } = await client.auth.resetPasswordForEmail(safeEmail, {
      redirectTo: baseUrl() + 'redefinir-senha.html'
    });
    return { error: mapError(error) };
  }

  async function updatePassword(newPassword) {
    if (!client) return { error: 'Configuracao ausente.' };
    const passwordErrors = passwordPolicyErrors(newPassword);
    if (passwordErrors.length) return { error: passwordErrors[0] };
    const { error } = await client.auth.updateUser({ password: newPassword });
    return { error: mapError(error) };
  }

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

  async function getProfile() {
    if (!client) return { error: 'Configuracao ausente.' };
    const user = await getUser();
    if (!user) return { error: 'Nao autenticado.' };
    const { data, error } = await client
      .from('profiles').select('*').eq('id', user.id).single();
    return { data, error: mapError(error) };
  }

  async function updateProfile(fields) {
    if (!client) return { error: 'Configuracao ausente.' };
    const user = await getUser();
    if (!user) return { error: 'Nao autenticado.' };
    const allowed = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'full_name')) {
      allowed.full_name = normalizeName(fields.full_name);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'phone')) {
      const safePhone = normalizePhoneBR(fields.phone);
      if (!safePhone) return { error: 'Informe um telefone brasileiro valido com DDD.' };
      allowed.phone = safePhone;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'birth_date')) {
      if (!isAdultBirthDate(fields.birth_date)) return { error: 'Para atualizar o cadastro, e preciso ter 18 anos ou mais.' };
      allowed.birth_date = fields.birth_date;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'marketing_consent')) {
      allowed.marketing_consent = !!fields.marketing_consent;
    }
    if (!Object.keys(allowed).length) return { error: 'Nenhum campo permitido para atualizar.' };
    const { data, error } = await client
      .from('profiles').update(allowed).eq('id', user.id).select().single();
    return { data, error: mapError(error) };
  }

  async function listAddresses() {
    if (!client) return { data: [], error: 'Configuracao ausente.' };
    const { data, error } = await client
      .from('addresses').select('*').order('is_default', { ascending: false });
    return { data: data || [], error: mapError(error) };
  }

  async function createAddress(fields) {
    if (!client) return { error: 'Configuracao ausente.' };
    const user = await getUser();
    if (!user) return { error: 'Nao autenticado.' };
    const { data, error } = await client
      .from('addresses').insert({ ...fields, user_id: user.id }).select().single();
    return { data, error: mapError(error) };
  }

  async function updateAddress(id, fields) {
    if (!client) return { error: 'Configuracao ausente.' };
    const { data, error } = await client
      .from('addresses').update(fields).eq('id', id).select().single();
    return { data, error: mapError(error) };
  }

  async function deleteAddress(id) {
    if (!client) return { error: 'Configuracao ausente.' };
    const { error } = await client.from('addresses').delete().eq('id', id);
    return { error: mapError(error) };
  }

  async function setDefaultAddress(id) {
    if (!client) return { error: 'Configuracao ausente.' };
    const user = await getUser();
    if (!user) return { error: 'Nao autenticado.' };
    const { error: clearErr } = await client
      .from('addresses').update({ is_default: false }).eq('user_id', user.id).neq('id', id);
    if (clearErr) return { error: mapError(clearErr) };
    const { data, error } = await client
      .from('addresses').update({ is_default: true }).eq('id', id).select().single();
    return { data, error: mapError(error) };
  }

  async function listOrders() {
    if (!client) return { data: [], error: 'Configuracao ausente.' };
    const { data, error } = await client
      .from('orders')
      .select('id, status, tracking_code, total_cents, subtotal_cents, shipping_cents, discount_cents, created_at, updated_at, order_items(*)')
      .order('created_at', { ascending: false });
    return { data: data || [], error: mapError(error) };
  }

  async function invokeFunction(name, payload) {
    if (!client) return { error: 'Configuracao ausente.' };
    const session = await getSession();
    if (!session) return { error: 'Nao autenticado.' };
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
        return { error: (data && (data.error || data.message)) || 'Erro na funcao: ' + res.status, data };
      }
      return { data, error: null };
    } catch (err) {
      return { error: err.message || 'Falha de rede ao chamar funcao.' };
    }
  }

  window.DruzaAuth = {
    client,
    signUp, signIn, signOut,
    requestPasswordReset, updatePassword,
    getSession, getUser, requireAuth, onAuthChange,
    getProfile, updateProfile,
    listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress,
    listOrders,
    invokeFunction,
    validators: {
      normalizeEmail,
      normalizePhoneBR,
      formatPhoneBR,
      isValidEmail,
      isAdultBirthDate,
      maxAdultBirthDate,
      passwordPolicyErrors
    }
  };
})();

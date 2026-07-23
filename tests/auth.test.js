const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AUTH_PATH = path.join(__dirname, '..', 'js', 'auth.js');
const AUTH_SOURCE = fs.readFileSync(AUTH_PATH, 'utf8');

function normalize(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function loadAuth(overrides = {}) {
  const authCalls = {
    signUp: [],
    signInWithPassword: [],
    signOut: [],
    resetPasswordForEmail: [],
    updateUser: [],
    onAuthStateChange: [],
  };

  const authResponses = {
    signUp: { data: { user: { id: 'user-1' } }, error: null },
    signInWithPassword: { data: { session: { access_token: 'token-1' } }, error: null },
    signOut: { error: null },
    resetPasswordForEmail: { error: null },
    updateUser: { data: { user: { id: 'user-1' } }, error: null },
  };

  let authStateHandler = null;
  const client = {
    auth: {
      signUp: async (payload) => {
        authCalls.signUp.push(payload);
        return authResponses.signUp;
      },
      signInWithPassword: async (payload) => {
        authCalls.signInWithPassword.push(payload);
        return authResponses.signInWithPassword;
      },
      signOut: async (options) => {
        authCalls.signOut.push(options);
        return authResponses.signOut;
      },
      resetPasswordForEmail: async (email, options) => {
        authCalls.resetPasswordForEmail.push([email, options]);
        return authResponses.resetPasswordForEmail;
      },
      updateUser: async (payload, options) => {
        authCalls.updateUser.push([payload, options]);
        return authResponses.updateUser;
      },
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: (callback) => {
        authCalls.onAuthStateChange.push(callback);
        authStateHandler = callback;
        return {
          data: {
            subscription: {
              unsubscribe() {},
            },
          },
        };
      },
    },
    from() {
      throw new Error('Unexpected database access in auth tests');
    },
  };

  const context = {
    window: {
      DRUZA_CONFIG: {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
      },
      supabase: {
        createClient(url, key) {
          assert.equal(url, 'https://example.supabase.co');
          assert.equal(key, 'anon-key');
          return client;
        },
      },
      location: {
        origin: 'https://druza.example',
        pathname: '/conta/login.html',
      },
    },
    console: {
      warn() {},
      error() {},
    },
    fetch: async () => {
      throw new Error('Unexpected fetch in auth tests');
    },
    setTimeout,
    clearTimeout,
  };

  context.window.window = context.window;
  Object.assign(authResponses, overrides.authResponses || {});
  if (overrides.clientAuth) {
    Object.assign(client.auth, overrides.clientAuth);
  }
  if (overrides.window) {
    Object.assign(context.window, overrides.window);
  }
  if (overrides.console) {
    Object.assign(context.console, overrides.console);
  }
  if (overrides.globals) {
    Object.assign(context, overrides.globals);
  }

  vm.runInNewContext(AUTH_SOURCE, context, { filename: 'js/auth.js' });

  return {
    auth: context.window.DruzaAuth,
    authCalls,
    authResponses,
    emitAuthEvent(event, session) {
      assert.ok(authStateHandler, 'Auth state listener was not installed');
      authStateHandler(event, session);
    },
    getOnAuthStateChangeCallCount() {
      return authCalls.onAuthStateChange.length;
    },
  };
}

test('installs a single auth subscription immediately and tracks only password recovery', () => {
  const env = loadAuth();

  assert.equal(env.getOnAuthStateChangeCallCount(), 1);
  assert.equal(env.auth.hasPasswordRecovery(), false);

  env.emitAuthEvent('SIGNED_IN', { access_token: 'session-token' });
  assert.equal(env.auth.hasPasswordRecovery(), false);

  env.emitAuthEvent('PASSWORD_RECOVERY', { access_token: 'recovery-token' });
  assert.equal(env.auth.hasPasswordRecovery(), true);
});

test('replays PASSWORD_RECOVERY safely to late subscribers and returns unsubscribe', () => {
  const env = loadAuth();
  env.emitAuthEvent('PASSWORD_RECOVERY', { access_token: 'recovery-token' });

  const events = [];
  const unsubscribe = env.auth.onAuthChange((event, session) => {
    events.push({ event, session });
  });

  assert.equal(typeof unsubscribe, 'function');
  assert.deepEqual(events, [{ event: 'PASSWORD_RECOVERY', session: null }]);

  unsubscribe();
  env.emitAuthEvent('SIGNED_IN', { access_token: 'other-token' });
  assert.deepEqual(events, [{ event: 'PASSWORD_RECOVERY', session: null }]);
});

test('signUp preserves metadata and sends captchaToken in options', async () => {
  const env = loadAuth();

  await env.auth.signUp({
    fullName: 'Maria da Silva',
    email: 'MARIA@example.com ',
    phone: '(11) 91234-5678',
    birthDate: '1990-05-10',
    password: 'SenhaMuitoForte!123',
    marketingConsent: true,
    captchaToken: 'captcha-signup',
  });

  assert.equal(env.authCalls.signUp.length, 1);
  assert.deepEqual(normalize(env.authCalls.signUp[0]), {
    email: 'maria@example.com',
    password: 'SenhaMuitoForte!123',
    options: {
      emailRedirectTo: 'https://druza.example/conta/login.html',
      captchaToken: 'captcha-signup',
      data: {
        full_name: 'Maria da Silva',
        phone: '+5511912345678',
        birth_date: '1990-05-10',
        marketing_consent: true,
      },
    },
  });
});

test('signUp neutralizes account-existence and confirmation errors', async () => {
  const cases = [
    { code: 'user_already_exists', message: 'User already registered' },
    { code: 'email_not_confirmed', message: 'Email not confirmed' },
    { message: 'User already exists' },
  ];

  for (const error of cases) {
    const env = loadAuth({
      authResponses: {
        signUp: { data: null, error },
      },
    });
    const result = await env.auth.signUp({
      fullName: 'Pessoa de Teste',
      email: 'pessoa@example.com',
      phone: '(11) 91234-5678',
      birthDate: '1990-05-10',
      password: 'SenhaMuitoForte!123',
      marketingConsent: false,
      captchaToken: 'captcha-signup',
    });

    assert.deepEqual(normalize(result), { data: null, error: null });
  }
});

test('signIn sends captchaToken inside options and preserves weakPassword success data', async () => {
  const weakPasswordData = {
    session: { access_token: 'token-1' },
    weakPassword: { reasons: ['length'] },
  };
  const env = loadAuth({
    authResponses: {
      signInWithPassword: { data: weakPasswordData, error: null },
    },
  });

  const result = await env.auth.signIn({
    email: 'USER@example.com',
    password: 'SenhaMuitoForte!123',
    captchaToken: 'captcha-login',
  });

  assert.deepEqual(normalize(env.authCalls.signInWithPassword[0]), {
    email: 'user@example.com',
    password: 'SenhaMuitoForte!123',
    options: {
      captchaToken: 'captcha-login',
    },
  });
  assert.equal(result.error, null);
  assert.equal(result.data, weakPasswordData);
});

test('signIn omits empty captchaToken while preserving payload shape', async () => {
  const env = loadAuth();

  await env.auth.signIn({
    email: 'user@example.com',
    password: 'SenhaMuitoForte!123',
    captchaToken: '',
  });

  assert.equal(env.authCalls.signInWithPassword[0].email, 'user@example.com');
  assert.equal(env.authCalls.signInWithPassword[0].password, 'SenhaMuitoForte!123');
  assert.ok(Object.prototype.hasOwnProperty.call(env.authCalls.signInWithPassword[0].options, 'captchaToken'));
  assert.equal(env.authCalls.signInWithPassword[0].options.captchaToken, undefined);
});

test('requestPasswordReset sends redirectTo with captchaToken in second options object', async () => {
  const env = loadAuth();

  await env.auth.requestPasswordReset(' USER@example.com ', 'captcha-reset');

  assert.deepEqual(normalize(env.authCalls.resetPasswordForEmail[0]), [
    'user@example.com',
    {
      redirectTo: 'https://druza.example/conta/redefinir-senha.html',
      captchaToken: 'captcha-reset',
    },
  ]);
});

test('requestPasswordReset turns empty captchaToken into undefined', async () => {
  const env = loadAuth();

  await env.auth.requestPasswordReset('user@example.com', '');

  assert.equal(env.authCalls.resetPasswordForEmail[0][0], 'user@example.com');
  assert.equal(
    env.authCalls.resetPasswordForEmail[0][1].redirectTo,
    'https://druza.example/conta/redefinir-senha.html'
  );
  assert.ok(Object.prototype.hasOwnProperty.call(env.authCalls.resetPasswordForEmail[0][1], 'captchaToken'));
  assert.equal(env.authCalls.resetPasswordForEmail[0][1].captchaToken, undefined);
});

test('requestPasswordReset neutralizes every remote Auth response', async () => {
  const remoteErrors = [
    { code: 'user_not_found', message: 'User not found' },
    { code: 'over_email_send_rate_limit', message: 'Email rate limit reached' },
    { code: 'over_request_rate_limit', message: 'Request rate limit reached' },
    { code: 'captcha_failed', message: 'Captcha failed' },
    { code: 'unexpected_failure', message: 'Unexpected failure' },
  ];

  for (const error of remoteErrors) {
    const env = loadAuth({
      authResponses: {
        resetPasswordForEmail: { error },
      },
    });
    const result = await env.auth.requestPasswordReset('pessoa@example.com', 'captcha-reset');
    assert.deepEqual(normalize(result), { error: null });
  }
});

test('requestPasswordReset neutralizes a rejected remote request', async () => {
  let callCount = 0;
  const env = loadAuth({
    clientAuth: {
      resetPasswordForEmail: async () => {
        callCount += 1;
        throw new Error('synthetic network failure');
      },
    },
  });

  const result = await env.auth.requestPasswordReset('pessoa@example.com', 'captcha-reset');

  assert.deepEqual(normalize(result), { error: null });
  assert.equal(callCount, 1);
});

test('signOut preserves global logout without options and forwards local scope when provided', async () => {
  const env = loadAuth();

  const globalResult = await env.auth.signOut();
  const localResult = await env.auth.signOut({ scope: 'local' });

  assert.equal(globalResult, undefined);
  assert.deepEqual(normalize(localResult), { error: null });
  assert.deepEqual(normalize(env.authCalls.signOut), [null, { scope: 'local' }]);
});

test('signOut maps auth errors for scoped logout', async () => {
  const env = loadAuth({
    authResponses: {
      signOut: {
        error: {
          code: 'over_request_rate_limit',
          message: 'Rate limit reached',
        },
      },
    },
  });

  const result = await env.auth.signOut({ scope: 'local' });

  assert.deepEqual(normalize(result), {
    error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  });
});

test('password policy now requires at least 12 characters', () => {
  const env = loadAuth();

  const errors = env.auth.validators.passwordPolicyErrors('Aa1!aaaa');

  assert.equal(errors[0], 'A senha precisa ter no minimo 12 caracteres.');
});

test('updatePassword surfaces 12-character minimum locally', async () => {
  const env = loadAuth();

  const result = await env.auth.updatePassword('Aa1!aaaa');

  assert.deepEqual(normalize(result), {
    error: 'A senha precisa ter no minimo 12 caracteres.',
  });
  assert.equal(env.authCalls.updateUser.length, 0);
});

test('mapError prioritizes error.code for captcha, rate limit, weak password and still falls back to messages', async () => {
  const cases = [
    {
      error: { code: 'captcha_failed', message: 'invalid login' },
      expected: 'Confirme a verificacao de seguranca e tente novamente.',
    },
    {
      error: { code: 'over_request_rate_limit', message: 'invalid login' },
      expected: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    },
    {
      error: { code: 'over_email_send_rate_limit', message: 'invalid login' },
      expected: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    },
    {
      error: { code: 'weak_password', message: 'invalid login' },
      expected: 'A senha precisa ter no minimo 12 caracteres.',
    },
    {
      error: { message: 'Invalid login credentials' },
      expected: 'Nao foi possivel entrar. Verifique os dados e a confirmacao do e-mail.',
    },
    {
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
      expected: 'Nao foi possivel entrar. Verifique os dados e a confirmacao do e-mail.',
    },
  ];

  for (const testCase of cases) {
    const env = loadAuth({
      authResponses: {
        signInWithPassword: { data: { session: null }, error: testCase.error },
      },
    });
    const result = await env.auth.signIn({
      email: 'user@example.com',
      password: 'SenhaMuitoForte!123',
      captchaToken: 'captcha-login',
    });
    assert.equal(result.error, testCase.expected);
  }
});

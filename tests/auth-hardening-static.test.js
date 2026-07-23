const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const pages = {
  signup: fs.readFileSync(path.join(root, 'cadastro.html'), 'utf8'),
  login: fs.readFileSync(path.join(root, 'login.html'), 'utf8'),
  admin: fs.readFileSync(path.join(root, 'admin-login.html'), 'utf8'),
  recovery: fs.readFileSync(path.join(root, 'recuperar-senha.html'), 'utf8'),
  reset: fs.readFileSync(path.join(root, 'redefinir-senha.html'), 'utf8'),
  privacy: fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8')
};

function assertScriptOrder(html, label) {
  const configIndex = html.indexOf('src="js/config.public.js"');
  const supabaseIndex = html.indexOf('@supabase/supabase-js@2.45.0');
  const securityIndex = html.indexOf('src="js/auth-security.js"');
  const authIndex = html.indexOf('src="js/auth.js"');
  assert.notEqual(configIndex, -1, `${label} missing public config`);
  assert.notEqual(supabaseIndex, -1, `${label} missing Supabase SDK`);
  assert.notEqual(securityIndex, -1, `${label} missing auth-security.js`);
  assert.notEqual(authIndex, -1, `${label} missing auth.js`);
  assert.ok(
    configIndex < supabaseIndex && supabaseIndex < securityIndex && securityIndex < authIndex,
    `${label} has wrong script order`
  );
  assert.match(
    html,
    /@supabase\/supabase-js@2\.45\.0[^>]+integrity="sha384-dGnL7r9uccC9TdSdE05clTJ6esxMU42XBQ1\/BWLzKQOBi7qR1aCMRIi0LzUmexIg"[^>]+crossorigin="anonymous"/,
    `${label} changed the pinned SDK integrity contract`
  );
}

test('all auth pages load auth-security.js in the approved order', () => {
  assertScriptOrder(pages.signup, 'cadastro.html');
  assertScriptOrder(pages.login, 'login.html');
  assertScriptOrder(pages.admin, 'admin-login.html');
  assertScriptOrder(pages.recovery, 'recuperar-senha.html');
  assertScriptOrder(pages.reset, 'redefinir-senha.html');
  assert.ok(
    pages.admin.indexOf('src="js/auth.js"') < pages.admin.indexOf('src="js/admin.js"'),
    'admin-login.html must load admin.js after auth.js'
  );
});

test('entry pages expose common turnstile wrapper and retry button', () => {
  for (const [label, html] of Object.entries({
    cadastro: pages.signup,
    login: pages.login,
    admin: pages.admin,
    recuperar: pages.recovery
  })) {
    assert.match(html, /class="auth-security"/, `${label} missing common security wrapper`);
    assert.match(html, /aria-live="polite"/, `${label} missing aria-live status`);
    assert.match(html, /type="button" class="btn btn--ghost auth-security__retry"/, `${label} missing retry button`);
    assert.match(html, /createTurnstileController\(\{[\s\S]*retryElement:/, `${label} missing retryElement wiring`);
    assert.match(
      html,
      /syncSecurityVisibility\(\);\s*security\.init\(\)/,
      `${label} must reveal an active security wrapper before awaiting the loader`
    );
  }
});

test('signup, login, admin and recovery pass captchaToken to the approved auth methods', () => {
  assert.match(pages.signup, /signUp\(\{[\s\S]*captchaToken: captchaToken[\s\S]*\}\)/);
  assert.match(pages.login, /signIn\(\{ email: email, password: password, captchaToken: captchaToken \}\)/);
  assert.match(pages.admin, /signIn\(\{ email: email, password: password, captchaToken: captchaToken \}\)/);
  assert.match(pages.recovery, /requestPasswordReset\(email, captchaToken\)/);
});

test('signup no longer contains inline turnstile loader and reset page enforces recovery flow', () => {
  assert.doesNotMatch(pages.signup, /captcha-container/);
  assert.doesNotMatch(pages.signup, /turnstile\.render/);
  assert.doesNotMatch(pages.reset, /SIGNED_IN/);
  assert.doesNotMatch(pages.reset, /auth-security__widget/);
  assert.match(pages.reset, /hasPasswordRecovery\(\)/);
  assert.match(pages.reset, /checkPwnedPassword\(password\)/);
  assert.match(pages.reset, /updatePassword\(password\)/);
  assert.match(pages.reset, /signOut\(\{ scope: 'local' \}\)/);
});

test('password minimum is 12 where required and HIBP is absent from login flows', () => {
  assert.match(pages.signup, /minlength="12"/);
  assert.match(pages.signup, /Minimo de 12 caracteres/);
  assert.match(pages.reset, /minlength="12"/);
  assert.match(pages.reset, /Minimo de 12 caracteres/);
  assert.doesNotMatch(pages.login, /checkPwnedPassword/);
  assert.doesNotMatch(pages.admin, /checkPwnedPassword/);
  assert.match(pages.signup, /id="password-security-warning"[^>]*aria-live="polite"/);
  assert.match(pages.reset, /id="password-security-warning"[^>]*aria-live="polite"/);
});

test('privacy page mentions Cloudflare Turnstile and Have I Been Pwned factually', () => {
  assert.match(pages.privacy, /Cloudflare Turnstile/);
  assert.match(pages.privacy, /Have I Been Pwned Pwned Passwords/);
  assert.match(pages.privacy, /cinco primeiros caracteres do hash SHA-1/);
  assert.match(pages.privacy, /senha completa, o hash completo, e-mail, telefone, nome e identificadores da conta não são enviados/);
});

test('no owned public page logs console secrets or mentions secret key', () => {
  for (const [label, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /console\./, `${label} should not log to console`);
    assert.doesNotMatch(html, /SECRET_KEY/i, `${label} should not mention secret key`);
  }
});

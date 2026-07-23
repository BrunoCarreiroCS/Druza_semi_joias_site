const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const NEUTRAL_RECOVERY_MESSAGE =
  'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Verifique sua caixa de entrada.';

function readInlineScript(filename) {
  const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => match[2])
    .filter((source) => source.trim());

  assert.equal(scripts.length, 1, `${filename} must have one executable inline script`);
  return scripts[0];
}

function createClassList(element) {
  return {
    add(name) {
      const classes = new Set(element.className.split(/\s+/).filter(Boolean));
      classes.add(name);
      element.className = [...classes].join(' ');
    },
    contains(name) {
      return element.className.split(/\s+/).includes(name);
    }
  };
}

function createElement(id) {
  const element = {
    id,
    className: '',
    disabled: false,
    hidden: false,
    textContent: '',
    value: '',
    listeners: Object.create(null),
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute() {},
    focus() {}
  };
  element.classList = createClassList(element);
  return element;
}

function createForm(id, values) {
  const form = createElement(id);
  form.elements = Object.create(null);

  for (const [name, value] of Object.entries(values)) {
    const field = createElement(name);
    field.value = value;
    form.elements[name] = field;
  }

  form.dispatchSubmit = function () {
    assert.equal(typeof this.listeners.submit, 'function', `${id} submit handler was not installed`);
    return this.listeners.submit({
      preventDefault() {}
    });
  };
  form.reset = function () {
    Object.values(this.elements).forEach((field) => {
      field.value = '';
    });
  };
  return form;
}

function createEntryPageHarness(filename, authOverrides = {}) {
  const calls = {
    getSession: 0,
    signIn: [],
    signOut: [],
    requestPasswordReset: [],
    securityReset: 0
  };
  const elements = Object.create(null);

  if (filename === 'recuperar-senha.html') {
    elements['reset-form'] = createForm('reset-form', {
      email: 'cliente@example.com'
    });
  } else {
    elements['login-form'] = createForm('login-form', {
      email: 'cliente@example.com',
      password: 'SenhaForte!123'
    });
  }

  if (filename === 'admin-login.html') {
    elements['code-form'] = createForm('code-form', { code: '' });
  }

  const document = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = createElement(id);
      }
      return elements[id];
    },
    querySelectorAll() {
      return [];
    }
  };

  const security = {
    init() {
      return Promise.resolve();
    },
    retry() {
      return Promise.resolve();
    },
    isActive() {
      return false;
    },
    isReady() {
      return true;
    },
    getToken() {
      return '';
    },
    reset() {
      calls.securityReset += 1;
    }
  };

  const auth = {
    validators: {
      isValidEmail(email) {
        if (authOverrides.isValidEmail) {
          return authOverrides.isValidEmail(email);
        }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
      }
    },
    getSession() {
      calls.getSession += 1;
      return Promise.resolve(null);
    },
    signIn(payload) {
      calls.signIn.push(payload);
      if (authOverrides.signIn) {
        return authOverrides.signIn(payload);
      }
      return Promise.resolve({ error: null });
    },
    signOut(options) {
      calls.signOut.push(options);
      return Promise.resolve({ error: null });
    },
    requestPasswordReset(email, captchaToken) {
      calls.requestPasswordReset.push([email, captchaToken]);
      if (authOverrides.requestPasswordReset) {
        return authOverrides.requestPasswordReset(email, captchaToken);
      }
      return Promise.resolve({ error: null });
    }
  };

  const admin = {
    checkAccess() {
      return Promise.resolve(true);
    },
    getAAL() {
      return Promise.resolve({ current: 'aal2', next: 'aal2' });
    },
    listFactors() {
      return Promise.resolve([]);
    },
    verifyFactor() {
      return Promise.resolve({ error: null });
    }
  };

  const location = {
    search: '',
    replacedTo: null,
    replace(target) {
      this.replacedTo = target;
    }
  };

  const context = {
    document,
    location,
    URLSearchParams,
    FormData: function FormData(form) {
      this.get = function (name) {
        const field = form.elements[name];
        return field ? field.value : null;
      };
    },
    DruzaAuth: auth,
    DruzaAdmin: admin,
    DruzaAuthSecurity: {
      createTurnstileController() {
        return security;
      }
    },
    fetch() {
      throw new Error('Unexpected network access');
    },
    setTimeout(handler) {
      handler();
      return 1;
    },
    clearTimeout() {},
    console: {
      log() {},
      warn() {},
      error() {}
    }
  };
  context.window = context;
  context.globalThis = context;

  vm.runInNewContext(readInlineScript(filename), context, {
    filename: `${filename}:inline`
  });

  return {
    calls,
    feedback: elements.feedback,
    form: filename === 'recuperar-senha.html'
      ? elements['reset-form']
      : elements['login-form'],
    location
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('login.html sends only one sign-in while the first Auth promise is pending', async () => {
  const pending = createDeferred();
  const harness = createEntryPageHarness('login.html', {
    signIn: () => pending.promise
  });

  const firstSubmit = harness.form.dispatchSubmit();
  const secondSubmit = harness.form.dispatchSubmit();

  assert.equal(harness.calls.signIn.length, 1);
  pending.resolve({ error: 'Credenciais invalidas.' });
  await Promise.all([firstSubmit, secondSubmit]);
  assert.equal(harness.calls.signIn.length, 1);
});

test('admin-login.html sends only one sign-in while the first Auth promise is pending', async () => {
  const pending = createDeferred();
  const harness = createEntryPageHarness('admin-login.html', {
    signIn: () => pending.promise
  });

  const firstSubmit = harness.form.dispatchSubmit();
  const secondSubmit = harness.form.dispatchSubmit();

  assert.equal(harness.calls.signIn.length, 1);
  pending.resolve({ error: 'Credenciais invalidas.' });
  await Promise.all([firstSubmit, secondSubmit]);
  assert.equal(harness.calls.signIn.length, 1);
});

test('recuperar-senha.html sends only one reset request while the first Auth promise is pending', async () => {
  const pending = createDeferred();
  const harness = createEntryPageHarness('recuperar-senha.html', {
    requestPasswordReset: () => pending.promise
  });

  const firstSubmit = harness.form.dispatchSubmit();
  const secondSubmit = harness.form.dispatchSubmit();

  assert.equal(harness.calls.requestPasswordReset.length, 1);
  pending.resolve({ error: 'Conta inexistente.' });
  await Promise.all([firstSubmit, secondSubmit]);
  assert.equal(harness.calls.requestPasswordReset.length, 1);
});

test('password recovery exposes the same neutral success for remote errors and rejected promises', async (t) => {
  const feedbackMessages = [];
  const scenarios = [
    {
      name: 'resolved remote error',
      requestPasswordReset: () => Promise.resolve({ error: 'Conta inexistente.' })
    },
    {
      name: 'rejected promise',
      requestPasswordReset: () => Promise.reject(new Error('Falha interna remota.'))
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const harness = createEntryPageHarness('recuperar-senha.html', {
        requestPasswordReset: scenario.requestPasswordReset
      });

      await harness.form.dispatchSubmit();

      assert.equal(harness.calls.requestPasswordReset.length, 1);
      assert.equal(harness.feedback.textContent, NEUTRAL_RECOVERY_MESSAGE);
      assert.equal(harness.feedback.classList.contains('is-success'), true);
      feedbackMessages.push(harness.feedback.textContent);
    });
  }

  assert.deepEqual(feedbackMessages, [
    NEUTRAL_RECOVERY_MESSAGE,
    NEUTRAL_RECOVERY_MESSAGE
  ]);
});

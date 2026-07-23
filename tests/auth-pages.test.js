const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(process.cwd(), 'redefinir-senha.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const recoveryScript = inlineScripts[0] && inlineScripts[0][1];

function createClassList(element) {
  return {
    add(name) {
      const classes = new Set((element.className || '').split(/\s+/).filter(Boolean));
      classes.add(name);
      element.className = Array.from(classes).join(' ');
    }
  };
}

function createElement(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    textContent: '',
    className: '',
    value: '',
    previousElementSibling: null,
    listeners: Object.create(null),
    classList: null,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    dispatch(type, payload) {
      if (this.listeners[type]) {
        return this.listeners[type](payload);
      }
      return undefined;
    }
  };
}

function createRecoveryHarness(options = {}) {
  const scheduled = [];
  const authEvents = [];
  const calls = [];

  const passwordInput = createElement('password');
  const confirmInput = createElement('confirm');
  const submitBtn = createElement('submit-btn');
  const feedback = createElement('feedback');
  const passwordSecurityWarning = createElement('password-security-warning');
  const recoveryStatus = createElement('recovery-status');
  const recoveryActions = createElement('recovery-actions');
  const recoveryRetry = createElement('recovery-retry');
  const toggle = createElement('toggle');
  toggle.previousElementSibling = passwordInput;

  passwordInput.classList = createClassList(passwordInput);
  confirmInput.classList = createClassList(confirmInput);
  submitBtn.classList = createClassList(submitBtn);
  feedback.classList = createClassList(feedback);
  passwordSecurityWarning.classList = createClassList(passwordSecurityWarning);
  recoveryStatus.classList = createClassList(recoveryStatus);
  recoveryActions.classList = createClassList(recoveryActions);
  recoveryRetry.classList = createClassList(recoveryRetry);
  toggle.classList = createClassList(toggle);

  const form = createElement('newpw-form');
  form.classList = createClassList(form);
  form.elements = {
    password: passwordInput,
    confirm: confirmInput
  };
  form.addEventListener = function (type, handler) {
    this.listeners[type] = handler;
  };
  form.dispatchSubmit = async function () {
    return this.listeners.submit({
      preventDefault() {}
    });
  };

  const elements = {
    'newpw-form': form,
    'feedback': feedback,
    'password-security-warning': passwordSecurityWarning,
    'recovery-status': recoveryStatus,
    'recovery-actions': recoveryActions,
    'recovery-retry': recoveryRetry,
    'submit-btn': submitBtn
  };

  const auth = {
    validators: {
      passwordPolicyErrors(password) {
        if (String(password).length < 12) {
          return ['A senha precisa ter no minimo 12 caracteres.'];
        }
        return [];
      }
    },
    hasPasswordRecovery() {
      return !!options.recoveryInitially || authEvents.includes('PASSWORD_RECOVERY');
    },
    onAuthChange(callback) {
      auth.callback = callback;
      return function unsubscribe() {
        auth.callback = null;
      };
    },
    async updatePassword(password) {
      calls.push(['updatePassword', password]);
      return options.updatePasswordResult || { error: null };
    },
    async signOut(payload) {
      calls.push(['signOut', payload]);
      return options.signOutResult || { error: null };
    },
    emit(eventName) {
      authEvents.push(eventName);
      if (auth.callback) {
        auth.callback(eventName);
      }
    }
  };

  const authSecurity = {
    async checkPwnedPassword(password) {
      calls.push(['checkPwnedPassword', password]);
      if (options.checkPwnedPassword) {
        return options.checkPwnedPassword(password);
      }
      return { status: options.pwnedStatus || 'safe' };
    }
  };

  const document = {
    getElementById(id) {
      return elements[id];
    },
    querySelectorAll(selector) {
      if (selector === '[data-pw-toggle]') {
        return [toggle];
      }
      return [];
    }
  };

  function setTimeoutImpl(handler, delay) {
    scheduled.push({ handler, delay });
    return scheduled.length;
  }

  function clearTimeoutImpl(id) {
    if (scheduled[id - 1]) {
      scheduled[id - 1].cleared = true;
    }
  }

  const context = {
    window: null,
    document,
    location: {
      replacedTo: null,
      replace(target) {
        this.replacedTo = target;
      }
    },
    FormData: function FormDataImpl(targetForm) {
      this.get = function (name) {
        return targetForm.elements[name].value;
      };
    },
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    DruzaAuth: auth,
    DruzaAuthSecurity: authSecurity,
    console
  };
  context.window = context;

  vm.runInNewContext(recoveryScript, context, { filename: 'redefinir-inline.js' });

  return {
    auth,
    calls,
    form,
    feedback,
    passwordSecurityWarning,
    recoveryStatus,
    recoveryActions,
    recoveryRetry,
    submitBtn,
    passwordInput,
    confirmInput,
    location: context.location,
    runTimeout() {
      const pending = scheduled.find((entry) => entry && !entry.cleared && !entry.ran);
      assert.ok(pending, 'expected a pending timeout');
      pending.ran = true;
      pending.handler();
    }
  };
}

test('direct access and SIGNED_IN do not unlock recovery form', async () => {
  const harness = createRecoveryHarness();

  assert.equal(harness.passwordInput.disabled, true);
  assert.equal(harness.submitBtn.disabled, true);

  harness.auth.emit('SIGNED_IN');
  assert.equal(harness.passwordInput.disabled, true);
  assert.equal(harness.submitBtn.disabled, true);

  harness.passwordInput.value = 'SenhaForte!12';
  harness.confirmInput.value = 'SenhaForte!12';
  await harness.form.dispatchSubmit();

  assert.equal(harness.calls.some((call) => call[0] === 'updatePassword'), false);
  assert.match(harness.feedback.textContent, /Link invalido ou expirado/);
});

test('PASSWORD_RECOVERY before subscriber unlocks immediately', () => {
  const harness = createRecoveryHarness({ recoveryInitially: true });

  assert.equal(harness.passwordInput.disabled, false);
  assert.equal(harness.submitBtn.disabled, false);
  assert.match(harness.recoveryStatus.textContent, /Link validado/);
});

test('PASSWORD_RECOVERY after subscriber still unlocks after timeout fallback', () => {
  const harness = createRecoveryHarness();

  harness.runTimeout();
  assert.equal(harness.passwordInput.disabled, true);
  assert.equal(harness.recoveryActions.hidden, false);

  harness.auth.emit('PASSWORD_RECOVERY');
  assert.equal(harness.passwordInput.disabled, false);
  assert.equal(harness.submitBtn.disabled, false);
  assert.equal(harness.recoveryActions.hidden, true);
});

test('pwned password blocks update', async () => {
  const harness = createRecoveryHarness({ recoveryInitially: true, pwnedStatus: 'pwned' });

  harness.passwordInput.value = 'SenhaForte!12';
  harness.confirmInput.value = 'SenhaForte!12';
  await harness.form.dispatchSubmit();

  assert.equal(harness.calls.some((call) => call[0] === 'updatePassword'), false);
  assert.match(harness.feedback.textContent, /senha unica/);
});

test('unavailable HIBP still updates, signs out locally and redirects', async () => {
  const harness = createRecoveryHarness({ recoveryInitially: true, pwnedStatus: 'unavailable' });

  harness.passwordInput.value = 'SenhaForte!12';
  harness.confirmInput.value = 'SenhaForte!12';
  await harness.form.dispatchSubmit();

  assert.deepEqual(
    harness.calls.map((call) => call[0]),
    ['checkPwnedPassword', 'updatePassword', 'signOut']
  );
  assert.equal(harness.calls[2][1].scope, 'local');
  assert.match(harness.passwordSecurityWarning.textContent, /ainda pode continuar/);
  assert.equal(harness.location.replacedTo, 'login.html');
});

test('double submit while HIBP is pending runs only one recovery transaction', async () => {
  let releaseCheck;
  const pendingCheck = new Promise((resolve) => {
    releaseCheck = resolve;
  });
  const harness = createRecoveryHarness({
    recoveryInitially: true,
    checkPwnedPassword: () => pendingCheck
  });

  harness.passwordInput.value = 'SenhaForte!12';
  harness.confirmInput.value = 'SenhaForte!12';
  const firstSubmit = harness.form.dispatchSubmit();
  const secondSubmit = harness.form.dispatchSubmit();

  assert.equal(harness.calls.filter((call) => call[0] === 'checkPwnedPassword').length, 1);
  releaseCheck({ status: 'safe' });
  await Promise.all([firstSubmit, secondSubmit]);

  assert.equal(harness.calls.filter((call) => call[0] === 'updatePassword').length, 1);
  assert.equal(harness.calls.filter((call) => call[0] === 'signOut').length, 1);
});

test('local logout failure keeps recovery form locked and does not redirect', async () => {
  const harness = createRecoveryHarness({
    recoveryInitially: true,
    signOutResult: { error: 'Falha ao encerrar a sessao.' }
  });

  harness.passwordInput.value = 'SenhaForte!12';
  harness.confirmInput.value = 'SenhaForte!12';
  await harness.form.dispatchSubmit();

  assert.equal(harness.passwordInput.disabled, true);
  assert.equal(harness.submitBtn.disabled, true);
  assert.equal(harness.location.replacedTo, null);
  assert.match(harness.recoveryStatus.textContent, /senha foi atualizada/);
});

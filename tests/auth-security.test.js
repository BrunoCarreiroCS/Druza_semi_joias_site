const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const MODULE_PATH = path.join(__dirname, '..', 'js', 'auth-security.js');

function createElement(tagName) {
  return {
    tagName: String(tagName || '').toUpperCase(),
    children: [],
    attributes: {},
    hidden: false,
    textContent: '',
    parentNode: null,
    style: {},
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      if (child) child.parentNode = null;
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'src') this.src = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

function createDocument() {
  const head = createElement('head');
  const body = createElement('body');
  return {
    head,
    body,
    createElement,
    querySelectorAll(selector) {
      if (selector !== 'script') return [];
      return head.children.filter((child) => child.tagName === 'SCRIPT');
    },
  };
}

function createScheduler() {
  let nextId = 1;
  const tasks = new Map();

  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      tasks.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    runDelay(delay) {
      const due = [];
      for (const [id, task] of tasks) {
        if (task.delay === delay) due.push([id, task.fn]);
      }
      due.forEach(([id]) => tasks.delete(id));
      due.forEach(([, fn]) => fn());
    },
    pendingCount() {
      return tasks.size;
    }
  };
}

function loadModule(options = {}) {
  const code = fs.readFileSync(MODULE_PATH, 'utf8');
  const document = options.document || createDocument();
  const scheduler = options.scheduler || createScheduler();
  const windowObject = options.window || {};
  windowObject.DRUZA_CONFIG = options.config || { TURNSTILE_SITE_KEY: '' };

  const context = {
    window: windowObject,
    document,
    console: options.console || { warn() {}, error() {}, log() {} },
    fetch: options.fetch || (async () => { throw new Error('fetch not mocked'); }),
    crypto: options.crypto || webcrypto,
    TextEncoder,
    AbortController: options.AbortController || AbortController,
    setTimeout: options.setTimeout || ((fn, delay) => scheduler.setTimeout(fn, delay)),
    clearTimeout: options.clearTimeout || ((id) => scheduler.clearTimeout(id)),
    module: { exports: {} },
    exports: {},
  };

  context.globalThis = context;
  context.self = windowObject;
  windowObject.document = document;
  windowObject.window = windowObject;
  windowObject.self = windowObject;

  vm.runInNewContext(code, context, { filename: MODULE_PATH });

  return {
    api: context.module.exports || windowObject.DruzaAuthSecurity,
    window: windowObject,
    document,
    scheduler,
    context,
  };
}

function sha1Hex(value) {
  return webcrypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
    .then((buffer) => Buffer.from(buffer).toString('hex').toUpperCase());
}

function plainResult(result) {
  return JSON.parse(JSON.stringify(result));
}

test('HIBP sends only the 5-char prefix with hardened fetch options and returns safe', async () => {
  const password = 'Correct Horse Battery Staple!';
  const hash = await sha1Hex(password);
  let fetchCall = null;

  const { api } = loadModule({
    fetch: async (url, init) => {
      fetchCall = { url, init };
      return {
        ok: true,
        status: 200,
        text: async () => 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0\r\nABCDEABCDEABCDEABCDEABCDEABCDEABCDE:0\r\n'
      };
    }
  });

  const result = await api.checkPwnedPassword(password);
  assert.deepEqual(plainResult(result), { status: 'safe' });
  assert.ok(fetchCall);
  assert.equal(fetchCall.url, 'https://api.pwnedpasswords.com/range/' + hash.slice(0, 5));
  assert.equal(fetchCall.init.method, 'GET');
  assert.equal(fetchCall.init.cache, 'no-store');
  assert.equal(fetchCall.init.referrerPolicy, 'no-referrer');
  assert.equal(fetchCall.init.headers['Add-Padding'], 'true');
  assert.equal(fetchCall.init.headers['add-padding'], undefined);
  assert.ok(fetchCall.url.includes(hash.slice(0, 5)));
  assert.ok(!fetchCall.url.includes(hash.slice(5)));
  assert.ok(!fetchCall.url.includes(password));
});

test('HIBP returns pwned without exposing counts when suffix count is positive', async () => {
  const password = 'teste-Pwned-123!';
  const hash = await sha1Hex(password);
  const suffix = hash.slice(5);

  const { api } = loadModule({
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\n' + suffix.toLowerCase() + ':42\r\n'
    })
  });

  const result = await api.checkPwnedPassword(password);
  assert.deepEqual(plainResult(result), { status: 'pwned' });
  assert.equal(Object.keys(result).length, 1);
});

test('HIBP ignores zero-count matches and padding lines', async () => {
  const password = 'Padding-Only-123!';
  const hash = await sha1Hex(password);
  const suffix = hash.slice(5);

  const { api } = loadModule({
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => suffix + ':0\r\n00000000000000000000000000000000000:0\r\n'
    })
  });

  const result = await api.checkPwnedPassword(password);
  assert.deepEqual(plainResult(result), { status: 'safe' });
});

test('HIBP handles malformed responses, non-200, network errors, missing subtle crypto and timeout as unavailable', async () => {
  const cases = [
    loadModule({
      fetch: async () => ({ ok: false, status: 503, text: async () => '' })
    }).api.checkPwnedPassword('Senha-1!'),
    loadModule({
      fetch: async () => ({ ok: true, status: 200, text: async () => 'INVALID-LINE' })
    }).api.checkPwnedPassword('Senha-2!'),
    loadModule({
      fetch: async () => { throw new Error('network'); }
    }).api.checkPwnedPassword('Senha-3!'),
    loadModule({
      crypto: {},
      fetch: async () => ({ ok: true, status: 200, text: async () => '' })
    }).api.checkPwnedPassword('Senha-4!'),
  ];

  for (const promise of cases) {
    assert.deepEqual(plainResult(await promise), { status: 'unavailable' });
  }
  let aborted = false;
  let timeoutDelay = null;
  let timeoutCleared = false;
  class FakeAbortController {
    constructor() {
      this.signal = {
        aborted: false,
        listeners: [],
        addEventListener: (eventName, listener) => {
          if (eventName === 'abort') this.signal.listeners.push(listener);
        }
      };
    }

    abort() {
      aborted = true;
      this.signal.aborted = true;
      this.signal.listeners.forEach((listener) => listener());
    }
  }

  const { api } = loadModule({
    AbortController: FakeAbortController,
    setTimeout: (fn, delay) => {
      timeoutDelay = delay;
      fn();
      return 1;
    },
    clearTimeout: (id) => {
      if (id === 1) timeoutCleared = true;
    },
    fetch: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
      if (init.signal.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }
    })
  });

  assert.deepEqual(plainResult(await api.checkPwnedPassword('Senha-5!')), { status: 'unavailable' });
  assert.equal(timeoutDelay, 5000);
  assert.equal(aborted, true);
  assert.equal(timeoutCleared, true);
});

test('Turnstile controller stays inactive when site key is empty', async () => {
  const container = createElement('div');
  const statusElement = createElement('p');
  const { api, document } = loadModule({
    config: { TURNSTILE_SITE_KEY: '' }
  });

  const controller = api.createTurnstileController({ container, statusElement });
  await controller.init();

  assert.equal(controller.isActive(), false);
  assert.equal(controller.isReady(), false);
  assert.equal(controller.getToken(), null);
  assert.equal(document.querySelectorAll('script').length, 0);
});

test('Turnstile loader is singleton, renders explicit managed widgets, stores token in memory and resets per instance', async () => {
  const document = createDocument();
  const renderCalls = [];
  const resetCalls = [];
  let widgetId = 0;

  const windowObject = {
    turnstile: {
      render(container, options) {
        renderCalls.push({ container, options });
        widgetId += 1;
        return 'wid-' + widgetId;
      },
      reset(id) {
        resetCalls.push(id);
      }
    }
  };

  const { api } = loadModule({
    document,
    window: windowObject,
    config: { TURNSTILE_SITE_KEY: 'site-key' }
  });

  const containerA = createElement('div');
  containerA.clientWidth = 360;
  const statusA = createElement('p');
  const retryA = createElement('button');
  const containerB = createElement('div');
  containerB.clientWidth = 240;
  const statusB = createElement('p');
  const retryB = createElement('button');

  const controllerA = api.createTurnstileController({ container: containerA, statusElement: statusA, retryElement: retryA });
  const controllerB = api.createTurnstileController({ container: containerB, statusElement: statusB, retryElement: retryB });

  const initA = controllerA.init();
  const initB = controllerB.init();

  assert.equal(document.querySelectorAll('script').length, 1);
  const script = document.querySelectorAll('script')[0];
  script.onload();
  await initA;
  await initB;

  assert.equal(controllerA.isActive(), true);
  assert.equal(controllerA.isReady(), true);
  assert.equal(controllerB.isActive(), true);
  assert.equal(renderCalls.length, 2);
  assert.equal(renderCalls[0].options.sitekey, 'site-key');
  assert.equal(renderCalls[0].options.execution, 'render');
  assert.equal(renderCalls[0].options.appearance, 'always');
  assert.equal(renderCalls[0].options.size, 'flexible');
  assert.equal(renderCalls[1].options.size, 'compact');
  assert.equal(typeof renderCalls[0].options.callback, 'function');
  assert.equal(typeof renderCalls[0].options['error-callback'], 'function');
  assert.equal(typeof renderCalls[0].options['expired-callback'], 'function');
  assert.equal(typeof renderCalls[0].options['timeout-callback'], 'function');

  renderCalls[0].options.callback('token-a');
  renderCalls[1].options.callback('token-b');
  assert.equal(controllerA.getToken(), 'token-a');
  assert.equal(controllerB.getToken(), 'token-b');

  renderCalls[0].options['expired-callback']();
  assert.equal(controllerA.getToken(), null);
  assert.equal(controllerA.isReady(), false);
  assert.equal(retryA.hidden, false);
  await controllerA.retry();
  assert.equal(controllerA.isReady(), true);
  assert.equal(retryA.hidden, true);
  renderCalls[1].options.callback('token-b2');
  renderCalls[1].options['error-callback']();
  assert.equal(controllerB.getToken(), null);
  assert.equal(controllerB.isReady(), false);
  assert.equal(retryB.hidden, false);
  renderCalls[1].options['timeout-callback']();
  assert.equal(controllerB.getToken(), null);
  assert.equal(retryB.hidden, false);

  renderCalls[0].options.callback('token-a2');
  controllerA.reset();
  assert.equal(controllerA.getToken(), null);
  assert.deepEqual(resetCalls, ['wid-1', 'wid-1']);
  assert.equal(controllerB.getToken(), null);
});

test('Turnstile loader timeout becomes visible and retryable', async () => {
  const document = createDocument();
  const scheduler = createScheduler();
  const windowObject = {};
  const { api } = loadModule({
    document,
    scheduler,
    window: windowObject,
    config: { TURNSTILE_SITE_KEY: 'site-key' }
  });

  const statusElement = createElement('p');
  const retryElement = createElement('button');
  const controller = api.createTurnstileController({
    container: createElement('div'),
    statusElement,
    retryElement
  });

  const initPromise = controller.init();
  assert.equal(statusElement.textContent, 'Carregando verificacao...');
  assert.equal(retryElement.hidden, true);
  assert.equal(document.querySelectorAll('script').length, 1);

  scheduler.runDelay(8000);
  await assert.rejects(initPromise, /timed out/);
  assert.equal(controller.isReady(), false);
  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(retryElement.hidden, false);
  assert.match(statusElement.textContent, /Nao foi possivel carregar/);

  let renderCount = 0;
  windowObject.turnstile = {
    render() {
      renderCount += 1;
      return 'wid-after-timeout';
    },
    reset() {}
  };
  const retryPromise = controller.retry();
  const retryScript = document.querySelectorAll('script')[0];
  retryScript.onload();
  await retryPromise;
  assert.equal(renderCount, 1);
  assert.equal(controller.isReady(), true);
  assert.equal(retryElement.hidden, true);
});

test('Turnstile retry discards a rejected loader promise and loads again', async () => {
  const document = createDocument();
  const windowObject = {};
  const { api } = loadModule({
    document,
    window: windowObject,
    config: { TURNSTILE_SITE_KEY: 'site-key' }
  });

  const container = createElement('div');
  const statusElement = createElement('p');
  const retryElement = createElement('button');
  const controller = api.createTurnstileController({ container, statusElement, retryElement });

  const initPromise = controller.init();
  const firstScript = document.querySelectorAll('script')[0];
  firstScript.onerror(new Error('load failed'));
  await assert.rejects(initPromise);
  assert.equal(controller.isReady(), false);
  assert.equal(retryElement.hidden, false);

  let renderCount = 0;
  windowObject.turnstile = {
    render() {
      renderCount += 1;
      return 'wid-retry';
    },
    reset() {}
  };

  const retryPromise = controller.retry();
  const scripts = document.querySelectorAll('script');
  assert.equal(scripts.length, 1);
  assert.notEqual(firstScript, scripts[0]);
  scripts[0].onload();
  await retryPromise;
  assert.equal(renderCount, 1);
  assert.equal(controller.isReady(), true);
  assert.equal(retryElement.hidden, true);
});

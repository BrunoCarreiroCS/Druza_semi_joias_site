(function (globalScope) {
  'use strict';

  function createAuthSecurity(deps) {
    const globalObject = deps.globalObject || {};
    const document = deps.document;
    const fetchImpl = deps.fetch;
    const cryptoImpl = deps.crypto;
    const TextEncoderImpl = deps.TextEncoder;
    const AbortControllerImpl = deps.AbortController;
    const setTimeoutImpl = deps.setTimeout;
    const clearTimeoutImpl = deps.clearTimeout;

    const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    const TURNSTILE_LOAD_TIMEOUT_MS = 8000;
    const HIBP_URL = 'https://api.pwnedpasswords.com/range/';
    const HIBP_TIMEOUT_MS = 5000;
    const siteKey = String(
      (globalObject.DRUZA_CONFIG && globalObject.DRUZA_CONFIG.TURNSTILE_SITE_KEY) || ''
    ).trim();

    let turnstileLoaderPromise = null;

    function getTurnstile() {
      return globalObject.turnstile || null;
    }

    function createLoaderPromise() {
      if (!document || !document.createElement) {
        return Promise.reject(new Error('Turnstile loader unavailable.'));
      }

      return new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        let settled = false;
        let timeoutId = null;

        function finish(callback, value) {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) clearTimeoutImpl(timeoutId);
          callback(value);
        }

        function discardScript() {
          if (script.parentNode && typeof script.parentNode.removeChild === 'function') {
            script.parentNode.removeChild(script);
          }
        }

        script.src = TURNSTILE_SRC;
        script.async = true;
        script.defer = true;
        script.onload = function () {
          if (getTurnstile() && typeof getTurnstile().render === 'function') {
            finish(resolve, getTurnstile());
            return;
          }
          finish(reject, new Error('Turnstile API unavailable.'));
        };
        script.onerror = function () {
          discardScript();
          finish(reject, new Error('Turnstile loader failed.'));
        };
        (document.head || document.body || document.documentElement).appendChild(script);
        timeoutId = setTimeoutImpl(function () {
          discardScript();
          finish(reject, new Error('Turnstile loader timed out.'));
        }, TURNSTILE_LOAD_TIMEOUT_MS);
      }).catch(function (error) {
        turnstileLoaderPromise = null;
        throw error;
      });
    }

    function loadTurnstile() {
      if (!turnstileLoaderPromise) {
        turnstileLoaderPromise = createLoaderPromise();
      }
      return turnstileLoaderPromise;
    }

    function setText(element, value) {
      if (element) element.textContent = value;
    }

    function setHidden(element, value) {
      if (element) element.hidden = !!value;
    }

    function invalidateToken(state) {
      state.token = null;
    }

    function createTurnstileController(options) {
      const container = options && options.container;
      const statusElement = options && options.statusElement;
      const retryElement = options && options.retryElement;
      const active = !!siteKey;
      const state = {
        active: active,
        ready: false,
        token: null,
        widgetId: null,
      };

      function renderWidget(turnstile) {
        if (!turnstile || typeof turnstile.render !== 'function') {
          throw new Error('Turnstile render unavailable.');
        }

        function markChallengeUnavailable(message) {
          invalidateToken(state);
          state.ready = false;
          setText(statusElement, message);
          setHidden(retryElement, false);
        }

        const containerWidth = Number(container && container.clientWidth) || 0;
        invalidateToken(state);
        state.widgetId = turnstile.render(container, {
          sitekey: siteKey,
          execution: 'render',
          appearance: 'always',
          size: containerWidth > 0 && containerWidth < 300 ? 'compact' : 'flexible',
          callback: function (token) {
            state.token = token || null;
            state.ready = true;
            setText(statusElement, '');
            setHidden(retryElement, true);
          },
          'expired-callback': function () {
            markChallengeUnavailable('Verificacao expirada. Tente novamente.');
          },
          'error-callback': function () {
            markChallengeUnavailable('Nao foi possivel validar a verificacao. Tente novamente.');
          },
          'timeout-callback': function () {
            markChallengeUnavailable('A verificacao demorou demais. Tente novamente.');
          }
        });
        state.ready = true;
        setText(statusElement, '');
        setHidden(retryElement, true);
      }

      async function init() {
        if (!state.active) {
          invalidateToken(state);
          state.ready = false;
          setHidden(retryElement, true);
          return;
        }

        setText(statusElement, 'Carregando verificacao...');
        setHidden(retryElement, true);

        try {
          const turnstile = await loadTurnstile();
          renderWidget(turnstile);
        } catch (error) {
          state.ready = false;
          invalidateToken(state);
          setText(statusElement, 'Nao foi possivel carregar a verificacao. Tente novamente.');
          setHidden(retryElement, false);
          throw error;
        }
      }

      async function retry() {
        if (!state.active) return;
        invalidateToken(state);
        const turnstile = getTurnstile();
        if (state.widgetId !== null && turnstile && typeof turnstile.reset === 'function') {
          try {
            turnstile.reset(state.widgetId);
            state.ready = true;
            setText(statusElement, '');
            setHidden(retryElement, true);
            return;
          } catch (_) {
            state.ready = false;
            setText(statusElement, 'Nao foi possivel reiniciar a verificacao. Tente novamente.');
            setHidden(retryElement, false);
            return;
          }
        }
        state.ready = false;
        return init();
      }

      function reset() {
        invalidateToken(state);
        if (!state.active || state.widgetId === null) return;
        const turnstile = getTurnstile();
        if (turnstile && typeof turnstile.reset === 'function') {
          try {
            turnstile.reset(state.widgetId);
            state.ready = true;
            setText(statusElement, '');
            setHidden(retryElement, true);
          } catch (_) {
            state.ready = false;
            setText(statusElement, 'Nao foi possivel reiniciar a verificacao. Tente novamente.');
            setHidden(retryElement, false);
          }
        }
      }

      return {
        init: init,
        retry: retry,
        isActive: function () {
          return state.active;
        },
        isReady: function () {
          return state.ready;
        },
        getToken: function () {
          return state.token;
        },
        reset: reset
      };
    }

    function bufferToHex(buffer) {
      const bytes = new Uint8Array(buffer);
      let hex = '';
      for (let index = 0; index < bytes.length; index += 1) {
        hex += bytes[index].toString(16).padStart(2, '0');
      }
      return hex.toUpperCase();
    }

    function parsePwnedResponse(body, suffix) {
      const lines = String(body || '').split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        const match = /^([0-9A-F]{35}):([0-9]+)$/i.exec(line);
        if (!match) return { status: 'unavailable' };
        if (match[1].toUpperCase() === suffix && Number(match[2]) > 0) {
          return { status: 'pwned' };
        }
      }
      return { status: 'safe' };
    }

    async function sha1Hex(password) {
      if (!cryptoImpl || !cryptoImpl.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
        throw new Error('Web Crypto unavailable.');
      }
      const encoded = new TextEncoderImpl().encode(String(password || ''));
      const digest = await cryptoImpl.subtle.digest('SHA-1', encoded);
      return bufferToHex(digest);
    }

    async function checkPwnedPassword(password) {
      if (typeof fetchImpl !== 'function' || !AbortControllerImpl) {
        return { status: 'unavailable' };
      }

      let timeoutId = null;

      try {
        const hash = await sha1Hex(password);
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);
        const controller = new AbortControllerImpl();

        timeoutId = setTimeoutImpl(function () {
          controller.abort();
        }, HIBP_TIMEOUT_MS);

        const response = await fetchImpl(HIBP_URL + prefix, {
          method: 'GET',
          headers: {
            'Add-Padding': 'true'
          },
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });

        if (!response || !response.ok || response.status !== 200 || typeof response.text !== 'function') {
          return { status: 'unavailable' };
        }

        const body = await response.text();
        return parsePwnedResponse(body, suffix);
      } catch (_) {
        return { status: 'unavailable' };
      } finally {
        if (timeoutId !== null) {
          clearTimeoutImpl(timeoutId);
        }
      }
    }

    return {
      createTurnstileController: createTurnstileController,
      checkPwnedPassword: checkPwnedPassword
    };
  }

  const api = createAuthSecurity({
    globalObject: globalScope.window || globalScope,
    document: globalScope.document,
    fetch: globalScope.fetch,
    crypto: globalScope.crypto,
    TextEncoder: globalScope.TextEncoder,
    AbortController: globalScope.AbortController,
    setTimeout: globalScope.setTimeout.bind(globalScope),
    clearTimeout: globalScope.clearTimeout.bind(globalScope)
  });

  if (globalScope.window) {
    globalScope.window.DruzaAuthSecurity = api;
  } else {
    globalScope.DruzaAuthSecurity = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

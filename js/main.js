/* =====================================================================
   DRUZA SEMI JOIAS — main.js
   Fase 1 (esqueleto): scaffolding das interações. Sem dependências.
   Comportamentos completos (carrinho real, frete, zoom, sticky bar)
   entram nas Fases 2d–2e — marcados com TODO.
   ===================================================================== */
(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const FOCUSABLE = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const UI_CONTRACT = {
    shippingRules: [
      { prefixes: ['01', '02', '03', '04'], text: 'Entrega simulada em 2 a 4 dias úteis · frete exemplo R$ 14,90.' },
      { prefixes: ['20', '21', '22', '23', '24'], text: 'Entrega simulada em 3 a 5 dias úteis · frete exemplo R$ 18,90.' }
    ],
    shippingFallback: 'Entrega simulada em 4 a 7 dias úteis · frete exemplo R$ 21,90.',
    whatsappPlaceholder: 'https://wa.me/'
  };

  /* ----------------------- Barra de anúncio ----------------------- */
  const announce = $('.announce');
  $('[data-close-announce]')?.addEventListener('click', () => announce?.remove());

  /* ----------------------- Drawers (menu + sacola) ----------------- */
  const overlay = $('[data-overlay]');
  const pageChrome = ['.announce', '.site-header', 'main', '.site-footer']
    .map((selector) => $(selector))
    .filter(Boolean);
  let activeDrawer = null;
  let lastTrigger = null;

  function getFocusable(container) {
    return $$(FOCUSABLE, container).filter((el) => {
      if (el.hasAttribute('hidden')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      return true;
    });
  }

  function setBackgroundInert(isInert) {
    pageChrome.forEach((node) => {
      if ('inert' in node) node.inert = isInert;
      if (isInert) node.setAttribute('aria-hidden', 'true');
      else node.removeAttribute('aria-hidden');
    });
  }

  function trapFocus(event) {
    if (!activeDrawer || event.key !== 'Tab') return;
    const focusable = getFocusable(activeDrawer);
    if (!focusable.length) {
      event.preventDefault();
      activeDrawer.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openDrawer(id, trigger) {
    const drawer = document.getElementById(id);
    if (!drawer || drawer === activeDrawer) return;
    closeDrawers();
    activeDrawer = drawer;
    lastTrigger = trigger || document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay?.removeAttribute('hidden');
    overlay?.classList.add('is-open');
    setBackgroundInert(true);
    document.body.style.overflow = 'hidden';
    $$('[data-open="' + id + '"]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    const focusable = getFocusable(drawer);
    (focusable[0] || drawer).focus();
  }

  function closeDrawers() {
    $$('.drawer.is-open').forEach((d) => {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
    });
    activeDrawer = null;
    overlay?.classList.remove('is-open');
    overlay?.setAttribute('hidden', '');
    setBackgroundInert(false);
    document.body.style.overflow = '';
    $$('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (lastTrigger instanceof HTMLElement) lastTrigger.focus();
    lastTrigger = null;
  }

  $$('[data-open]').forEach((btn) =>
    btn.addEventListener('click', () => openDrawer(btn.getAttribute('data-open'), btn))
  );
  $$('[data-close]').forEach((btn) => btn.addEventListener('click', closeDrawers));
  overlay?.addEventListener('click', closeDrawers);
  $$('.mobile-menu a').forEach((link) => link.addEventListener('click', closeDrawers));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeDrawer) closeDrawers();
    trapFocus(e);
  });

  /* ----------------------- Reveal no scroll ----------------------- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ----------------------- Galeria (troca de thumb) --------------- */
  const mainImg = $('.product__main img');
  $$('.product__thumbs img').forEach((thumb) =>
    thumb.addEventListener('click', () => {
      if (mainImg) {
        mainImg.src = thumb.src;
        mainImg.alt = thumb.alt;
      }
      // TODO (Fase 2d): estado ativo no thumb + zoom premium no hover
    })
  );

  /* ----------------------- Sacola (stub) -------------------------- */
  // TODO (Fase 2e): carrinho real (itens, subtotal, barra de frete grátis, checkout).
  let cartCount = 0;
  const cartBadge = $('.cart-count');
  const cartLiveRegion = $('[data-cart-live]');
  const ringSize = $('#ring-size');
  const sizeFeedback = $('[data-size-feedback]');

  function updateCartFeedback(message) {
    if (cartBadge) cartBadge.textContent = String(cartCount);
    if (cartLiveRegion) cartLiveRegion.textContent = message;
  }

  function validateRingSize() {
    if (!ringSize) return true;
    const isValid = ringSize.value.trim() !== '';
    ringSize.setAttribute('aria-invalid', String(!isValid));
    if (sizeFeedback) {
      sizeFeedback.textContent = isValid ? 'Tamanho selecionado.' : 'Selecione um tamanho antes de adicionar à sacola.';
      sizeFeedback.classList.toggle('is-error', !isValid);
      sizeFeedback.classList.toggle('is-success', isValid);
    }
    if (!isValid) ringSize.focus();
    return isValid;
  }

  ringSize?.addEventListener('change', validateRingSize);
  $$('[data-add-cart]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (!validateRingSize()) return;
      cartCount += 1;
      const sizeLabel = ringSize?.value ? ` tamanho ${ringSize.value}` : '';
      updateCartFeedback(`1 item exemplo adicionado à sacola${sizeLabel}. Total visual: ${cartCount}.`);
      openDrawer('cart-drawer', btn);
    })
  );

  /* ----------------------- Newsletter (stub) ---------------------- */
  const newsletterForm = $('[data-newsletter]');
  const newsletterFeedback = $('[data-newsletter-feedback]');

  newsletterForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailField = $('#news-email', newsletterForm);
    const consentField = $('#news-consent', newsletterForm);
    const hasEmail = Boolean(emailField?.value.trim());
    const hasConsent = Boolean(consentField?.checked);
    const isValidEmail = Boolean(emailField?.checkValidity());
    let message = 'Cadastro de exemplo confirmado. Integração real de e-mail ainda não foi conectada.';
    let isError = false;

    if (!hasEmail || !isValidEmail) {
      message = 'Digite um e-mail válido para continuar.';
      emailField?.focus();
      isError = true;
    } else if (!hasConsent) {
      message = 'Marque o consentimento antes de enviar a newsletter.';
      consentField?.focus();
      isError = true;
    }

    emailField?.setAttribute('aria-invalid', String(!hasEmail || !isValidEmail));
    consentField?.setAttribute('aria-invalid', String(!hasConsent));
    if (newsletterFeedback) {
      newsletterFeedback.textContent = message;
      newsletterFeedback.classList.toggle('is-error', isError);
      newsletterFeedback.classList.toggle('is-success', !isError);
    }
    if (!isError) newsletterForm.reset();
  });

  /* ----------------------- Frete / CEP (stub) --------------------- */
  const cepInput = $('#cep');
  const shippingForm = $('[data-shipping-form]');
  const cepButton = $('[data-calc-cep]');
  const cepFeedback = $('[data-cep-feedback]');

  function formatCep(value) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/^(\d{5})(\d{0,3}).*$/, (_, first, second) => (second ? `${first}-${second}` : first));
  }

  function getShippingMessage(cepDigits) {
    const rule = UI_CONTRACT.shippingRules.find((item) => item.prefixes.includes(cepDigits.slice(0, 2)));
    return rule ? rule.text : UI_CONTRACT.shippingFallback;
  }

  cepInput?.addEventListener('input', () => {
    cepInput.value = formatCep(cepInput.value);
    const cepDigits = cepInput.value.replace(/\D/g, '');
    const isPartialCep = cepDigits.length > 0 && cepDigits.length < 8;
    const isCompleteCep = cepDigits.length === 8;
    cepInput.setAttribute('aria-invalid', String(isPartialCep));
    if (cepFeedback) {
      cepFeedback.textContent = isPartialCep
        ? 'Complete o CEP com 8 dígitos para simular frete e prazo.'
        : (isCompleteCep ? getShippingMessage(cepDigits) : '');
      cepFeedback.classList.toggle('is-error', isPartialCep);
      cepFeedback.classList.toggle('is-success', isCompleteCep);
    }
  });

  function calculateCep() {
    if (!cepInput) return;
    const cepDigits = cepInput.value.replace(/\D/g, '');
    const isValid = cepDigits.length === 8;
    cepInput.setAttribute('aria-invalid', String(!isValid));
    if (cepFeedback) {
      cepFeedback.textContent = isValid
        ? getShippingMessage(cepDigits)
        : 'Digite um CEP com 8 dígitos para simular frete e prazo.';
      cepFeedback.classList.toggle('is-error', !isValid);
      cepFeedback.classList.toggle('is-success', isValid);
    }
    if (!isValid) cepInput.focus();
  }

  shippingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    calculateCep();
  });
  cepButton?.addEventListener('click', calculateCep);
  cepInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      calculateCep();
    }
  });

  /* ----------------------- Sticky buy bar (stub) ------------------ */
  // TODO (Fase 2d): mostrar .buy-bar no mobile quando o CTA principal sai da viewport.

  /* ----------------------- Hero: movimento de fundo ambiente ------ */
  // Partículas finas e esparsas (Apple-like, muito sutil). Desliga com
  // prefers-reduced-motion; pausa quando a aba está oculta ou o hero sai da viewport.
  (function heroAmbientParticles() {
    const canvas = $('[data-hero-particles]');
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLORS = ['rgba(201,139,144,', 'rgba(197,202,208,', 'rgba(95,183,168,']; // rosé · prata · paraíba
    const COUNT = 18;
    let w = 0, h = 0, dpr = 1, particles = [], raf = 0, running = false;

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function make() {
      particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.1 + 0.4,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -(Math.random() * 0.12 + 0.04),
        a: Math.random() * 0.22 + 0.06,
        tw: Math.random() * Math.PI * 2,
        c: COLORS[(Math.random() * COLORS.length) | 0]
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.tw += 0.01;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
        const alpha = (p.a * (0.6 + 0.4 * Math.sin(p.tw))).toFixed(3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c + alpha + ')';
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }
    function start() { if (!running) { running = true; raf = requestAnimationFrame(tick); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    size(); make();
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    const hero = canvas.closest('.hero');
    if ('IntersectionObserver' in window && hero) {
      new IntersectionObserver((e) => (e[0].isIntersecting ? start() : stop()), { threshold: 0 }).observe(hero);
    } else {
      start();
    }
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); make(); }, 200); });
  })();
})();

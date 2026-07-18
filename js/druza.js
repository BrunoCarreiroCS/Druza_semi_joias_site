/* =====================================================================
   DRUZA SEMI JOIAS — druza.js (comportamento compartilhado)
   Sem dependências. Cada bloco só roda se os elementos existirem.
   ===================================================================== */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FREE_SHIP = 199;
  var BRL = function (n) { return 'R$ ' + n.toFixed(2).replace('.', ','); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── Sacola (localStorage) ──────────────────────────────── */
  var CART_KEY = 'druza_cart';
  function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } }
  function writeCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); paint(); }
  function cartTotal(c) { return c.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }
  function cartCount(c) { return c.reduce(function (s, i) { return s + i.qty; }, 0); }
  function addToCart(item) {
    var c = readCart();
    var found = c.find(function (i) { return i.id === item.id && i.size === item.size; });
    if (found) found.qty += item.qty || 1; else c.push({ id: item.id, name: item.name, price: item.price, img: (item.img || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, ''), size: item.size || '', qty: item.qty || 1 });
    writeCart(c);
    openDrawer('cart');
  }
  function removeFromCart(idx) { var c = readCart(); c.splice(idx, 1); writeCart(c); }

  /* ── Pintura global (contadores, frete, sacola) ─────────── */
  function paint() {
    var c = readCart(), total = cartTotal(c), count = cartCount(c);
    $$('[data-cart-count]').forEach(function (el) { el.textContent = count; el.style.display = count ? 'flex' : 'none'; });
    // barra de frete
    var msg = $('[data-ship-msg]'), fill = $('[data-ship-fill]');
    if (msg && fill) {
      var pct = Math.max(0, Math.min(1, total / FREE_SHIP));
      fill.style.width = (pct * 100) + '%';
      if (total === 0) msg.innerHTML = 'Frete grátis acima de <b>' + BRL(FREE_SHIP) + '</b> · até 6× sem juros';
      else if (total >= FREE_SHIP) msg.innerHTML = '🎉 Você ganhou <b>frete grátis</b>!';
      else msg.innerHTML = 'Faltam <b>' + BRL(FREE_SHIP - total) + '</b> para o frete grátis';
    }
    // corpo da sacola
    var body = $('[data-cart-body]');
    if (body) {
      if (!c.length) { body.innerHTML = '<p class="cart-empty">Sua sacola está vazia.<br>Descubra as favoritas da Druza.</p>'; }
      else {
        body.innerHTML = c.map(function (i, idx) {
          return '<div class="cart-line"><img src="' + (i.img || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, '') + '" alt=""><div style="flex:1">' +
            '<div class="cart-line__name">' + i.name + '</div>' +
            '<div class="cart-line__meta">' + (i.size ? 'Tam. ' + i.size + ' · ' : '') + i.qty + '× ' + BRL(i.price) + '</div>' +
            '<button class="cart-line__rm" data-rm="' + idx + '">Remover</button></div>' +
            '<div style="font-variant-numeric:tabular-nums;color:var(--ink)">' + BRL(i.price * i.qty) + '</div></div>';
        }).join('');
      }
    }
    var sum = $('[data-cart-total]'); if (sum) sum.textContent = BRL(total);
    var foot = $('[data-cart-foot]'); if (foot) foot.style.display = c.length ? 'block' : 'none';
  }

  /* ── Drawers + overlay ──────────────────────────────────── */
  var overlay = $('[data-overlay]');
  function openDrawer(name) {
    var d = $('[data-drawer="' + name + '"]'); if (!d) return;
    if (overlay) overlay.classList.add('is-open');
    d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawers() {
    $$('.drawer').forEach(function (d) { d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); });
    if (overlay) overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  $$('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openDrawer(b.getAttribute('data-open')); }); });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeDrawers); });
  if (overlay) overlay.addEventListener('click', closeDrawers);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawers(); });
  document.addEventListener('click', function (e) {
    var rm = e.target.closest && e.target.closest('[data-rm]');
    if (rm) removeFromCart(parseInt(rm.getAttribute('data-rm'), 10));
  });

  /* ── Header sólido ao rolar (sobre hero) ────────────────── */
  var head = $('.head');
  if (head && head.hasAttribute('data-head-scroll')) {
    var onScroll = function () { head.classList.toggle('head--solid', window.scrollY > 40); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Header flutuante (marca centrada) + quick-nav + mobile-nav ── */
  var floatHead = $('.head--floating'), quick = $('[data-quick-nav]');
  if (floatHead) {
    var onFloat = function () { floatHead.classList.toggle('is-scrolled', window.scrollY > 40); if (quick) quick.classList.toggle('is-scrolled', window.scrollY > 40); };
    onFloat(); window.addEventListener('scroll', onFloat, { passive: true });
  }
  if (quick) {
    var panel = $('.quick-nav__panel', quick), trigger = $('[data-quick-nav-open]', quick);
    var setQuick = function (open) {
      panel.classList.toggle('is-open', open);
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    if (trigger) trigger.addEventListener('click', function (e) { e.stopPropagation(); setQuick(!panel.classList.contains('is-open')); });
    var qClose = $('[data-quick-nav-close]', quick); if (qClose) qClose.addEventListener('click', function () { setQuick(false); });
    document.addEventListener('click', function (e) { if (!quick.contains(e.target)) setQuick(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setQuick(false); });
  }
  var mNav = $('#mobile-nav'), mBtn = $('[data-home-menu]');
  if (mNav && mBtn) {
    mBtn.addEventListener('click', function () {
      var open = mNav.classList.toggle('is-open');
      mNav.setAttribute('aria-hidden', open ? 'false' : 'true');
      mBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('body-lock', open);
    });
    $$('a', mNav).forEach(function (a) { a.addEventListener('click', function () { mNav.classList.remove('is-open'); document.body.classList.remove('body-lock'); }); });
  }

  /* ── Botões "Adicionar à sacola" (data-add) ─────────────── */
  $$('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      var sizeWrap = document.querySelector('[data-size-group]');
      var size = sizeWrap ? (sizeWrap.querySelector('.is-active') || {}).textContent || '' : '';
      addToCart({ id: b.dataset.add, name: b.dataset.name, price: parseFloat(b.dataset.price), img: b.dataset.img, size: (size || '').trim() });
    });
  });

  /* ── Seletor de tamanho ─────────────────────────────────── */
  var sizeGroup = $('[data-size-group]');
  if (sizeGroup) {
    sizeGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', sizeGroup).forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
    });
  }

  /* ── Galeria de produto ─────────────────────────────────── */
  var gMain = $('[data-gallery-main]');
  if (gMain) {
    var gImg = gMain.querySelector('img');
    $$('[data-thumb]').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('[data-thumb]').forEach(function (x) { x.classList.remove('is-active'); });
        t.classList.add('is-active');
        gImg.src = t.getAttribute('data-src');
        gImg.style.objectPosition = t.getAttribute('data-pos') || 'center';
      });
    });
    gMain.addEventListener('click', function (e) {
      if (gMain.classList.toggle('is-zoom')) {
        var r = gMain.getBoundingClientRect();
        gImg.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
      }
    });
  }

  /* ── CEP (mock) ─────────────────────────────────────────── */
  var cepBtn = $('[data-cep-btn]');
  if (cepBtn) {
    cepBtn.addEventListener('click', function () {
      var out = $('[data-cep-out]'), input = $('[data-cep-input]');
      var v = (input.value || '').replace(/\D/g, '');
      if (v.length < 8) { out.textContent = 'Digite um CEP válido (8 dígitos).'; out.style.color = 'var(--rose-strong)'; return; }
      out.style.color = 'var(--text)';
      out.innerHTML = 'Entrega estimada: <b>3–6 dias úteis</b> · a partir de <b>R$ 18,90</b> (ou grátis acima de R$ 199).';
    });
  }

  /* ── Sticky buy bar ─────────────────────────────────────── */
  var sticky = $('[data-stickybuy]'), anchor = $('[data-buy-anchor]');
  if (sticky && anchor && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (ents) {
      sticky.classList.toggle('is-visible', !ents[0].isIntersecting && ents[0].boundingClientRect.top < 0);
    }, { threshold: 0 }).observe(anchor);
  }

  /* ── Catálogo: filtros + ordenação ──────────────────────── */
  var grid = $('[data-catalog]');
  if (grid) {
    var items = $$('[data-item]', grid);
    var countEl = $('[data-catalog-count]');
    var state = { cat: 'all', stone: 'all', sort: 'destaque' };
    function apply() {
      var visible = items.filter(function (el) {
        var okCat = state.cat === 'all' || el.dataset.cat === state.cat;
        var okStone = state.stone === 'all' || el.dataset.stone === state.stone;
        el.style.display = (okCat && okStone) ? '' : 'none';
        return okCat && okStone;
      });
      if (state.sort !== 'destaque') {
        visible.sort(function (a, b) {
          var pa = parseFloat(a.dataset.price), pb = parseFloat(b.dataset.price);
          return state.sort === 'menor' ? pa - pb : pb - pa;
        }).forEach(function (el) { grid.appendChild(el); });
      } else {
        items.forEach(function (el) { if (el.style.display !== 'none') grid.appendChild(el); });
      }
      if (countEl) countEl.textContent = visible.length + (visible.length === 1 ? ' peça' : ' peças');
    }
    $$('[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var key = chip.dataset.filter, val = chip.dataset.val;
        $$('[data-filter="' + key + '"]').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        state[key] = val; apply();
      });
    });
    var sortSel = $('[data-sort]');
    if (sortSel) sortSel.addEventListener('change', function () { state.sort = sortSel.value; apply(); });
    apply();
  }

  /* ── Hero slideshow ─────────────────────────────────────── */
  var slides = $$('[data-slide]'), dotsWrap = $('[data-dots]'), caption = $('[data-hero-caption]'), counter = $('[data-hero-count]');
  if (slides.length && dotsWrap) {
    var meta = [{ cat: 'Anéis', name: 'Anel Paraíba' }, { cat: 'Pulseiras', name: 'Pulseira Riviera' }, { cat: 'Anéis', name: 'Anel Coração' }];
    var active = 0, timer = null, pad = function (n) { return (n < 10 ? '0' : '') + n; };
    function render() {
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === active); });
      Array.prototype.forEach.call(dotsWrap.children, function (d, i) { d.classList.toggle('is-active', i === active); });
      if (caption && meta[active]) caption.innerHTML = meta[active].cat + ' · <span class="acc">' + meta[active].name + '</span>';
      if (counter) counter.textContent = pad(active + 1) + ' / ' + pad(slides.length);
    }
    function go(i) { active = (i + slides.length) % slides.length; render(); restart(); }
    function restart() { if (timer) clearInterval(timer); if (!reduce && slides.length > 1) timer = setInterval(function () { go(active + 1); }, 4200); }
    slides.forEach(function (_, i) {
      var b = document.createElement('button'); b.className = 'hero__dot' + (i === 0 ? ' is-active' : '');
      b.setAttribute('aria-label', 'Ir para o slide ' + (i + 1));
      b.addEventListener('click', function () { go(i); }); dotsWrap.appendChild(b);
    });
    render(); restart();
    document.addEventListener('visibilitychange', function () { if (document.hidden) { if (timer) clearInterval(timer); } else restart(); });
  }

  /* ── Reveal no scroll ───────────────────────────────────── */
  var els = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-visible'); }); }
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  paint();
})();

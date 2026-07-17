/* Druza — home: slideshow do hero + reveal no scroll */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Hero slideshow ─────────────────────────────── */
  var slides = Array.prototype.slice.call(document.querySelectorAll('[data-slide]'));
  var dotsWrap = document.querySelector('[data-dots]');
  var caption = document.querySelector('[data-hero-caption]');
  var counter = document.querySelector('[data-hero-count]');
  var meta = [
    { cat: 'Anéis', name: 'Anel Paraíba' },
    { cat: 'Pulseiras', name: 'Pulseira Riviera' },
    { cat: 'Anéis', name: 'Anel Coração' }
  ];
  var active = 0, timer = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function render() {
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === active); });
    if (dotsWrap) {
      Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
        d.classList.toggle('is-active', i === active);
      });
    }
    if (caption) caption.innerHTML = meta[active].cat + ' · <span class="acc">' + meta[active].name + '</span>';
    if (counter) counter.textContent = pad(active + 1) + ' / ' + pad(slides.length);
  }

  function go(i) { active = (i + slides.length) % slides.length; render(); restart(); }
  function next() { go(active + 1); }
  function restart() { if (timer) clearInterval(timer); if (!reduce && slides.length > 1) timer = setInterval(next, 4200); }

  if (slides.length && dotsWrap) {
    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.className = 'hero__dot' + (i === 0 ? ' is-active' : '');
      b.setAttribute('aria-label', 'Ir para o slide ' + (i + 1));
      b.addEventListener('click', function () { go(i); });
      dotsWrap.appendChild(b);
    });
    render();
    restart();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (timer) clearInterval(timer); } else { restart(); }
    });
  }

  /* ── Reveal no scroll ───────────────────────────── */
  var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach(function (e) { e.classList.add('is-visible'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (e) { io.observe(e); });
})();

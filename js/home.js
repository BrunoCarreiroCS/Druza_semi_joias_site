(function () {
  'use strict';

  const slides = Array.from(document.querySelectorAll('[data-home-slide]'));
  const dots = Array.from(document.querySelectorAll('[data-home-dot]'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeIndex = 0;
  let timer = 0;

  function setSlide(index) {
    if (!slides.length) return;
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === activeIndex);
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === activeIndex);
      dot.setAttribute('aria-current', dotIndex === activeIndex ? 'true' : 'false');
    });
  }

  function stop() {
    window.clearInterval(timer);
    timer = 0;
  }

  function start() {
    if (reducedMotion || timer || slides.length < 2) return;
    timer = window.setInterval(() => setSlide(activeIndex + 1), 5200);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      setSlide(index);
      stop();
      start();
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  const revealEls = Array.from(document.querySelectorAll('[data-home-reveal]'));
  if ('IntersectionObserver' in window && revealEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  setSlide(0);
  start();
})();

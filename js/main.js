/* =====================================================================
   DRUZA SEMI JOIAS — main.js
   Fase 1 (esqueleto): scaffolding das interações. Sem dependências.
   Comportamentos completos (carrinho real, frete, zoom, sticky bar)
   entram nas Fases 2d–2e — marcados com TODO.
   ===================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

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
    storageKey: 'druzaCartV1',
    freeShippingCents: 19900,
    couponCode: 'PRIMEIRADRUZA',
    couponDiscount: 0.1,
    expiredCouponCodes: ['DRUZA10', 'BEMVINDA'],
    products: window.DRUZA_CATALOG?.products || [],
    shippingRules: [
      { prefixes: ['01', '02', '03', '04'], label: 'São Paulo e região', days: '2 a 4 dias úteis', priceCents: 1490 },
      { prefixes: ['20', '21', '22', '23', '24'], label: 'Rio de Janeiro e região', days: '3 a 5 dias úteis', priceCents: 1890 }
    ],
    shippingFallback: { label: 'Demais regiões', days: '4 a 7 dias úteis', priceCents: 2190 },
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
      if (el.closest('[hidden], [aria-hidden="true"]')) return false;
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
  const galleryThumbs = $$('.product__thumbs img');
  function activateThumb(thumb) {
    galleryThumbs.forEach((item) => {
      item.classList.toggle('is-active', item === thumb);
      const button = item.closest('.product-thumb-button');
      button?.classList.toggle('is-active', item === thumb);
      button?.setAttribute('aria-current', item === thumb ? 'true' : 'false');
    });
  }
  galleryThumbs.forEach((thumb, index) => {
    const button = makeEl('button', 'product-thumb-button');
    button.type = 'button';
    button.setAttribute('aria-label', `Ver imagem ${index + 1} do produto`);
    thumb.parentElement?.insertBefore(button, thumb);
    button.append(thumb);
    if (index === 0) activateThumb(thumb);
    button.addEventListener('click', () => {
      if (mainImg) {
        mainImg.src = thumb.src;
        mainImg.alt = thumb.alt;
      }
      activateThumb(thumb);
    });
  });

  /* ----------------------- Sacola + checkout local ---------------- */
  const cartPanels = $$('[data-cart-panel]');
  const cartLiveRegion = $('[data-cart-live]');
  const ringSize = $('#ring-size');
  const sizeFeedback = $('[data-size-feedback]');
  const checkoutForms = $$('[data-checkout-form]');
  const orderFeedbacks = $$('[data-order-feedback]');
  let sizeOptionButtons = [];
  let cartState = { items: [], shipping: null, coupon: null };

  function formatMoney(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }

  function formatCep(value) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/^(\d{5})(\d{0,3}).*$/, (_, first, second) => (second ? `${first}-${second}` : first));
  }

  function formatPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function makeEl(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function getCatalogProduct(id) {
    return UI_CONTRACT.products.find((product) => product.id === id);
  }

  function getPrimaryProduct() {
    return getCatalogProduct('anel-coracao-esmeralda') || UI_CONTRACT.products[0];
  }

  function renderProductPlaceholder(product) {
    const placeholder = makeEl('div', 'ph ph--4x5');
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', product.imageAlt || 'Foto em breve do produto.');
    placeholder.dataset.placeholder = 'product-image';
    placeholder.append(
      makeEl('strong', 'ph__title', 'Foto em breve'),
      makeEl('p', 'ph__desc', product.placeholderDescription || 'Entrara uma foto real desta peca.'),
      makeEl('span', 'ph__tag', 'placeholder')
    );
    return placeholder;
  }

  function renderCatalogCard(product) {
    const article = makeEl('article', 'product-card');
    article.dataset.category = product.category || '';
    article.dataset.stone = product.stone || '';

    const link = makeEl('a', 'product-card__link');
    link.href = product.url || 'produto.html';
    const media = makeEl('span', 'product-card__media');
    if (product.realImage && product.image) {
      const image = makeEl('img');
      image.src = product.image;
      image.width = 800;
      image.height = 1000;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.alt = product.imageAlt || product.name;
      media.append(image);
    } else {
      media.append(renderProductPlaceholder(product));
    }
    link.append(media, makeEl('span', 'product-card__name', product.name));
    article.append(
      link,
      makeEl('span', 'price', formatMoney(product.priceCents)),
      makeEl('span', 'product-card__parcela', product.installments || '')
    );
    return article;
  }

  function renderCatalogGrids() {
    $$('[data-product-grid]').forEach((grid) => {
      const mode = grid.dataset.productGrid;
      const products = UI_CONTRACT.products.filter((product) => (
        mode === 'featured' ? product.featured : product.related
      ));
      if (!products.length) return;
      grid.replaceChildren();
      products.forEach((product) => grid.append(renderCatalogCard(product)));
    });
  }

  function getShippingQuote(cepDigits, subtotalCents = 0) {
    const rule = UI_CONTRACT.shippingRules.find((item) => item.prefixes.includes(cepDigits.slice(0, 2))) || UI_CONTRACT.shippingFallback;
    const isFree = subtotalCents >= UI_CONTRACT.freeShippingCents;
    const priceCents = isFree ? 0 : rule.priceCents;
    return {
      cep: formatCep(cepDigits),
      label: rule.label,
      days: rule.days,
      priceCents,
      text: `Entrega simulada para ${rule.label}: ${rule.days} · ${isFree ? 'frete grátis' : `frete exemplo ${formatMoney(priceCents)}`}.`
    };
  }

  function getCartSubtotal() {
    return cartState.items.reduce((total, item) => total + item.priceCents * item.quantity, 0);
  }

  function getCartDiscount() {
    return cartState.coupon === UI_CONTRACT.couponCode ? Math.round(getCartSubtotal() * UI_CONTRACT.couponDiscount) : 0;
  }

  function getCartShipping() {
    if (!cartState.shipping || !cartState.items.length) return null;
    return getShippingQuote(cartState.shipping.cep.replace(/\D/g, ''), getCartSubtotal());
  }

  function getCartTotal() {
    const shipping = getCartShipping();
    return Math.max(0, getCartSubtotal() - getCartDiscount() + (shipping?.priceCents || 0));
  }

  function saveCart() {
    try {
      localStorage.setItem(UI_CONTRACT.storageKey, JSON.stringify(cartState));
    } catch (error) {
      console.warn('Não foi possível salvar a sacola local.', error);
    }
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_CONTRACT.storageKey) || '{}');
      cartState = {
        items: Array.isArray(saved.items) ? saved.items.filter((item) => item && item.id && item.quantity > 0) : [],
        shipping: saved.shipping && saved.shipping.cep ? saved.shipping : null,
        coupon: saved.coupon === UI_CONTRACT.couponCode ? saved.coupon : null
      };
    } catch (error) {
      cartState = { items: [], shipping: null, coupon: null };
    }
  }

  function updateCartLive(message) {
    const count = cartState.items.reduce((total, item) => total + item.quantity, 0);
    $$('.cart-count').forEach((badge) => {
      badge.textContent = String(count);
      badge.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} na sacola`);
    });
    if (cartLiveRegion) cartLiveRegion.textContent = message || (count ? `${count} item${count === 1 ? '' : 's'} na sacola.` : 'Sacola vazia.');
  }

  function syncCepFields(cep) {
    const formattedCep = formatCep(cep);
    const productCepInput = $('#cep');
    if (productCepInput) productCepInput.value = formattedCep;
    checkoutForms.forEach((form) => {
      if (form.elements.cep && !form.elements.cep.value) form.elements.cep.value = formattedCep;
    });
  }

  function validateRingSize() {
    if (!ringSize) return true;
    const isValid = ringSize.value.trim() !== '';
    ringSize.setAttribute('aria-invalid', String(!isValid));
    sizeOptionButtons.forEach((button) => {
      const isSelected = button.dataset.sizeValue === ringSize.value;
      button.setAttribute('aria-checked', String(isSelected));
      button.classList.toggle('is-selected', isSelected);
    });
    if (sizeFeedback) {
      sizeFeedback.textContent = isValid ? 'Tamanho selecionado.' : 'Selecione um tamanho antes de adicionar à sacola.';
      sizeFeedback.classList.toggle('is-error', !isValid);
      sizeFeedback.classList.toggle('is-success', isValid);
    }
    if (!isValid) (sizeOptionButtons[0] || ringSize).focus();
    return isValid;
  }

  function enhanceSizeSelector() {
    if (!ringSize || ringSize.dataset.enhanced === 'true') return;
    const options = $$('option', ringSize).filter((option) => option.value);
    if (!options.length) return;
    const group = makeEl('div', 'size-options');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Escolha o tamanho do anel');
    sizeOptionButtons = options.map((option) => {
      const button = makeEl('button', 'size-option', option.textContent);
      button.type = 'button';
      button.dataset.sizeValue = option.value;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.addEventListener('click', () => {
        ringSize.value = option.value;
        ringSize.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.append(button);
      return button;
    });
    ringSize.insertAdjacentElement('afterend', group);
    ringSize.classList.add('select--visually-hidden');
    ringSize.tabIndex = -1;
    ringSize.setAttribute('aria-hidden', 'true');
    ringSize.dataset.enhanced = 'true';
    validateRingSize();
  }

  function renderCartItem(item) {
    const row = makeEl('article', 'cart-item');
    const image = makeEl('img');
    image.src = item.image;
    image.alt = item.name;
    image.width = 72;
    image.height = 90;

    const body = makeEl('div', 'cart-item__body');
    const title = makeEl('strong', 'cart-item__name', item.name);
    const meta = makeEl('span', 'cart-item__meta', `Tamanho ${item.size} · ${formatMoney(item.priceCents)}`);
    const controls = makeEl('div', 'cart-item__controls');
    const qty = makeEl('div', 'cart-qty');

    const dec = makeEl('button', '', '−');
    dec.type = 'button';
    dec.setAttribute('aria-label', `Diminuir quantidade de ${item.name}`);
    dec.dataset.cartAction = 'decrease';
    dec.dataset.itemKey = item.key;

    const quantity = makeEl('span', '', String(item.quantity));
    quantity.setAttribute('aria-label', `Quantidade ${item.quantity}`);

    const inc = makeEl('button', '', '+');
    inc.type = 'button';
    inc.setAttribute('aria-label', `Aumentar quantidade de ${item.name}`);
    inc.dataset.cartAction = 'increase';
    inc.dataset.itemKey = item.key;

    const remove = makeEl('button', 'cart-remove', 'Remover');
    remove.type = 'button';
    remove.dataset.cartAction = 'remove';
    remove.dataset.itemKey = item.key;

    const total = makeEl('span', 'cart-item__total', formatMoney(item.priceCents * item.quantity));
    qty.append(dec, quantity, inc);
    controls.append(qty, remove, total);
    body.append(title, meta, controls);
    row.append(image, body);
    return row;
  }

  function renderCartPanel(panel) {
    panel.replaceChildren();

    if (!cartState.items.length) {
      const empty = makeEl('div', 'cart-empty');
      empty.append(
        makeEl('strong', '', 'Sua sacola está vazia.'),
        makeEl('p', '', 'Escolha uma peça para simular subtotal, frete e checkout.')
      );
      const link = makeEl('a', 'btn btn--secondary', 'Ver coleção');
      link.href = 'produto.html#prod-title';
      empty.append(link);
      panel.append(empty);
      return;
    }

    const list = makeEl('div', 'cart-list');
    cartState.items.forEach((item) => list.append(renderCartItem(item)));

    const subtotal = getCartSubtotal();
    const missingForFreeShipping = Math.max(0, UI_CONTRACT.freeShippingCents - subtotal);
    const progressValue = Math.min(subtotal, UI_CONTRACT.freeShippingCents);
    const progressPercent = Math.round((progressValue / UI_CONTRACT.freeShippingCents) * 100);
    const progressWrap = makeEl('div', 'cart-progress-card');
    const progress = makeEl('p', 'cart-progress', missingForFreeShipping ? `Faltam ${formatMoney(missingForFreeShipping)} para frete grátis.` : 'Frete grátis liberado para esta sacola.');
    const progressBar = makeEl('div', 'cart-progressbar');
    const progressFill = makeEl('span');
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', String(UI_CONTRACT.freeShippingCents));
    progressBar.setAttribute('aria-valuenow', String(progressValue));
    progressBar.setAttribute('aria-label', 'Progresso para frete grátis');
    progressFill.style.setProperty('--cart-progress', `${progressPercent}%`);
    progressBar.append(progressFill);
    progressWrap.append(progress, progressBar);

    const shippingForm = makeEl('form', 'cart-shipping');
    shippingForm.dataset.cartShippingForm = '';
    shippingForm.noValidate = true;
    const shippingInput = makeEl('input');
    shippingInput.type = 'text';
    shippingInput.name = 'cart-cep';
    shippingInput.inputMode = 'numeric';
    shippingInput.autocomplete = 'postal-code';
    shippingInput.maxLength = 9;
    shippingInput.placeholder = 'Seu CEP';
    shippingInput.value = cartState.shipping?.cep || '';
    shippingInput.dataset.cartCep = '';
    const shippingButton = makeEl('button', 'btn btn--ghost', 'Calcular');
    shippingButton.type = 'submit';
    shippingForm.append(shippingInput, shippingButton);
    const shippingFeedback = makeEl('p', 'form-feedback');
    shippingFeedback.dataset.cartShippingFeedback = '';
    const shipping = getCartShipping();
    if (shipping) {
      shippingFeedback.textContent = shipping.text;
      shippingFeedback.classList.add('is-success');
    }

    const couponForm = makeEl('form', 'cart-coupon');
    couponForm.dataset.couponForm = '';
    couponForm.noValidate = true;
    const couponInput = makeEl('input');
    couponInput.type = 'text';
    couponInput.name = 'coupon';
    couponInput.placeholder = 'Cupom';
    couponInput.autocomplete = 'off';
    couponInput.dataset.couponInput = '';
    couponInput.value = cartState.coupon || '';
    const couponButton = makeEl('button', 'btn btn--ghost', 'Aplicar');
    couponButton.type = 'submit';
    couponForm.append(couponInput, couponButton);
    const couponFeedback = makeEl('p', 'form-feedback');
    couponFeedback.dataset.couponFeedback = '';
    if (cartState.coupon) {
      couponFeedback.textContent = 'Cupom PRIMEIRADRUZA aplicado.';
      couponFeedback.classList.add('is-success');
    }

    const summary = makeEl('div', 'cart-summary');
    [
      ['Subtotal', formatMoney(subtotal)],
      ['Desconto', getCartDiscount() ? `− ${formatMoney(getCartDiscount())}` : 'R$ 0,00'],
      ['Frete', shipping ? (shipping.priceCents ? formatMoney(shipping.priceCents) : 'Grátis') : 'Calcule pelo CEP'],
      ['Total', formatMoney(getCartTotal()), 'cart-summary__row--total']
    ].forEach(([label, value, modifier]) => {
      const row = makeEl('div', `cart-summary__row ${modifier || ''}`.trim());
      row.append(makeEl('span', '', label), makeEl('strong', '', value));
      summary.append(row);
    });

    const actions = makeEl('div', 'cart-actions');
    const continueButton = makeEl('button', 'btn btn--secondary', 'Continuar comprando');
    continueButton.type = 'button';
    continueButton.dataset.cartAction = 'continue';
    const checkoutButton = makeEl('button', 'btn btn--primary', 'Ir para checkout simulado');
    checkoutButton.type = 'button';
    checkoutButton.dataset.cartAction = 'checkout';
    actions.append(continueButton, checkoutButton);

    panel.append(list, progressWrap, shippingForm, shippingFeedback, couponForm, couponFeedback, summary, actions);
  }

  function renderCart(message) {
    cartPanels.forEach(renderCartPanel);
    renderCheckoutReviews();
    syncCheckoutVisibility();
    if (cartState.items.length) clearOrderFeedback();
    updateCartLive(message);
  }

  function syncCheckoutVisibility() {
    const hasItems = cartState.items.length > 0;
    checkoutForms.forEach((form) => {
      form.hidden = !hasItems;
      form.setAttribute('aria-hidden', String(!hasItems));
    });
  }

  function clearOrderFeedback() {
    orderFeedbacks.forEach((feedback) => {
      feedback.replaceChildren();
      feedback.classList.remove('is-error', 'is-success');
    });
  }

  function setOrderFeedback(orderId, whatsappText) {
    orderFeedbacks.forEach((feedback) => {
      feedback.replaceChildren();
      feedback.append(document.createTextNode(`Pedido simulado ${orderId} confirmado. Nenhuma cobranca foi realizada. `));
      const whatsappLink = makeEl('a', '', 'Enviar resumo pelo WhatsApp');
      whatsappLink.href = `${UI_CONTRACT.whatsappPlaceholder}?text=${encodeURIComponent(whatsappText)}`;
      whatsappLink.rel = 'noopener noreferrer';
      feedback.append(whatsappLink);
      feedback.classList.remove('is-error');
      feedback.classList.add('is-success');
    });
  }

  function renderCheckoutReviews() {
    $$('[data-checkout-review]').forEach((review) => {
      review.replaceChildren();
      if (!cartState.items.length) {
        review.hidden = true;
        return;
      }
      review.hidden = false;
      review.append(makeEl('strong', '', 'Revisão do pedido'));
      const list = makeEl('ul');
      cartState.items.forEach((item) => {
        list.append(makeEl('li', '', `${item.quantity}x ${item.name} · tamanho ${item.size} · ${formatMoney(item.priceCents * item.quantity)}`));
      });
      const shipping = getCartShipping();
      const totals = makeEl('p', '', `Subtotal ${formatMoney(getCartSubtotal())} · desconto ${formatMoney(getCartDiscount())} · frete ${shipping ? (shipping.priceCents ? formatMoney(shipping.priceCents) : 'grátis') : 'a calcular'} · total ${formatMoney(getCartTotal())}`);
      review.append(list, totals);
    });
  }

  function buildWhatsappOrderText(orderId) {
    const lines = [
      `Pedido simulado ${orderId} - Druza Semi Joias`,
      '',
      'Itens:'
    ];
    cartState.items.forEach((item) => {
      lines.push(`- ${item.quantity}x ${item.name} tamanho ${item.size} (${formatMoney(item.priceCents * item.quantity)})`);
    });
    const shipping = getCartShipping();
    lines.push('', `Subtotal: ${formatMoney(getCartSubtotal())}`);
    if (getCartDiscount()) lines.push(`Desconto: ${formatMoney(getCartDiscount())}`);
    lines.push(`Frete: ${shipping ? (shipping.priceCents ? formatMoney(shipping.priceCents) : 'gratis') : 'a calcular'}`);
    lines.push(`Total: ${formatMoney(getCartTotal())}`);
    lines.push('', 'Mensagem gerada por prototipo. Nenhuma cobranca foi realizada.');
    return lines.join('\n');
  }

  function addProductToCart(trigger) {
    if (!validateRingSize()) return;
    const product = getPrimaryProduct();
    if (!product) return;
    const size = ringSize?.value || 'único';
    const key = `${product.id}-${size}`;
    const existing = cartState.items.find((item) => item.key === key);
    if (existing) existing.quantity += 1;
    else cartState.items.push({ ...product, key, size, quantity: 1 });
    saveCart();
    renderCart(`${product.name}, tamanho ${size}, adicionado à sacola.`);
    openDrawer('cart-drawer', trigger);
  }

  function updateItemQuantity(key, delta) {
    const item = cartState.items.find((entry) => entry.key === key);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) cartState.items = cartState.items.filter((entry) => entry.key !== key);
    saveCart();
    renderCart('Sacola atualizada.');
  }

  function removeItem(key) {
    cartState.items = cartState.items.filter((item) => item.key !== key);
    saveCart();
    renderCart('Item removido da sacola.');
  }

  function focusCheckout() {
    $('[data-checkout-form] input, [data-checkout-form] select')?.focus();
  }

  ringSize?.addEventListener('change', validateRingSize);
  $$('[data-add-cart]').forEach((btn) => btn.addEventListener('click', () => addProductToCart(btn)));

  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-cart-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.cartAction;
    const key = actionButton.dataset.itemKey;
    if (action === 'increase') updateItemQuantity(key, 1);
    if (action === 'decrease') updateItemQuantity(key, -1);
    if (action === 'remove') removeItem(key);
    if (action === 'continue') closeDrawers();
    if (action === 'checkout') focusCheckout();
  });

  document.addEventListener('input', (event) => {
    const cepField = event.target.closest('[data-cart-cep], [data-checkout-form] input[name="cep"]');
    if (cepField) cepField.value = formatCep(cepField.value);
    const phoneField = event.target.closest('[data-checkout-form] input[name="phone"]');
    if (phoneField) phoneField.value = formatPhone(phoneField.value);
  });

  document.addEventListener('submit', (event) => {
    const shippingForm = event.target.closest('[data-cart-shipping-form]');
    const couponForm = event.target.closest('[data-coupon-form]');
    if (!shippingForm && !couponForm) return;
    event.preventDefault();

    if (shippingForm) {
      const input = $('[data-cart-cep]', shippingForm);
      const feedback = shippingForm.nextElementSibling;
      const cepDigits = input?.value.replace(/\D/g, '') || '';
      const isValid = cepDigits.length === 8;
      input?.setAttribute('aria-invalid', String(!isValid));
      if (!isValid) {
        if (feedback) {
          feedback.textContent = 'Digite um CEP com 8 dígitos para simular frete e prazo.';
          feedback.classList.add('is-error');
          feedback.classList.remove('is-success');
        }
        input?.focus();
        return;
      }
      cartState.shipping = getShippingQuote(cepDigits, getCartSubtotal());
      syncCepFields(cartState.shipping.cep);
      saveCart();
      renderCart(cartState.shipping.text);
    }

    if (couponForm) {
      const input = $('[data-coupon-input]', couponForm);
      const feedback = couponForm.nextElementSibling;
      const code = input?.value.trim().toUpperCase() || '';
      const isValid = code === UI_CONTRACT.couponCode;
      const isExpired = UI_CONTRACT.expiredCouponCodes.includes(code);

      if (!code) {
        input?.setAttribute('aria-invalid', 'true');
        if (feedback) {
          feedback.textContent = 'Digite um cupom para aplicar o desconto.';
          feedback.classList.add('is-error');
          feedback.classList.remove('is-success');
        }
        input?.focus();
        return;
      }

      if (isValid && cartState.coupon === UI_CONTRACT.couponCode) {
        input?.setAttribute('aria-invalid', 'false');
        if (feedback) {
          feedback.textContent = 'Cupom PRIMEIRADRUZA já está aplicado nesta sacola.';
          feedback.classList.remove('is-error');
          feedback.classList.add('is-success');
        }
        return;
      }

      input?.setAttribute('aria-invalid', String(!isValid));
      if (isValid) {
        cartState.coupon = UI_CONTRACT.couponCode;
        saveCart();
        renderCart('Cupom aplicado à sacola.');
      } else if (feedback) {
        feedback.textContent = isExpired
          ? 'Esse cupom expirou. Para testar o protótipo, use PRIMEIRADRUZA.'
          : 'Cupom não encontrado. Para testar o protótipo, use PRIMEIRADRUZA.';
        feedback.classList.add('is-error');
        feedback.classList.remove('is-success');
      }
    }
  });

  checkoutForms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const feedback = $('[data-checkout-feedback]', form);
      if (!cartState.items.length) {
        if (feedback) {
          feedback.textContent = 'Adicione uma peça à sacola antes de finalizar.';
          feedback.classList.add('is-error');
          feedback.classList.remove('is-success');
        }
        return;
      }

      const cepField = form.elements.cep;
      const cepDigits = cepField?.value.replace(/\D/g, '') || '';
      cepField?.setAttribute('aria-invalid', String(cepDigits.length !== 8));
      if (!form.checkValidity() || cepDigits.length !== 8) {
        const firstInvalid = $('input:invalid, select:invalid', form) || cepField;
        if (feedback) {
          feedback.textContent = 'Preencha os dados obrigatórios para simular o pedido.';
          feedback.classList.add('is-error');
          feedback.classList.remove('is-success');
        }
        firstInvalid?.focus();
        return;
      }

      if (!cartState.shipping) {
        cartState.shipping = getShippingQuote(cepDigits, getCartSubtotal());
        syncCepFields(cartState.shipping.cep);
      }
      const orderId = `DRZ-${Date.now().toString().slice(-6)}`;
      const whatsappText = buildWhatsappOrderText(orderId);
      form.reset();
      cartState = { items: [], shipping: null, coupon: null };
      saveCart();
      renderCart(`Pedido simulado ${orderId} confirmado.`);
      if (feedback) feedback.replaceChildren();
      setOrderFeedback(orderId, whatsappText);
    });
  });

  renderCatalogGrids();
  enhanceSizeSelector();
  loadCart();
  if (cartState.shipping?.cep) syncCepFields(cartState.shipping.cep);
  renderCart();

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

  function getShippingMessage(cepDigits) {
    return getShippingQuote(cepDigits, getCartSubtotal()).text;
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
    if (isValid) {
      cartState.shipping = getShippingQuote(cepDigits, getCartSubtotal());
      syncCepFields(cartState.shipping.cep);
      saveCart();
      renderCart(cartState.shipping.text);
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

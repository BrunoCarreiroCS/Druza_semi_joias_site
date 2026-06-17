(function () {
  'use strict';

  const productId = window.DRUZA_PRODUCT_ID;
  const products = window.DRUZA_CATALOG?.products || [];
  const product = products.find((item) => item.id === productId) || products[0];
  const $ = (selector, ctx = document) => ctx.querySelector(selector);
  const $$ = (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector));

  if (!product) return;

  function formatMoney(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }

  function setText(selector, text) {
    const element = $(selector);
    if (element) element.textContent = text;
  }

  function setAttr(selector, attr, value) {
    const element = $(selector);
    if (element && value !== undefined && value !== null) element.setAttribute(attr, value);
  }

  function makePlaceholder(description) {
    const wrap = document.createElement('div');
    wrap.className = 'ph ph--4x5';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', product.imageAlt || 'Foto em breve do produto.');
    wrap.innerHTML = [
      '<strong class="ph__title">Foto em breve</strong>',
      `<p class="ph__desc">${description || 'Entrará uma imagem real desta peça.'}</p>`,
      '<span class="ph__tag">placeholder</span>'
    ].join('');
    return wrap;
  }

  function renderProductDropdownNav() {
    const logo = $('.site-header .logo');
    const nav = $('.site-header .content-nav');
    const actions = $('.site-header .header-actions');
    if (logo) {
      logo.innerHTML = `
        <svg class="logo__seal" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle cx="24" cy="24" r="23" fill="var(--rose)" />
          <g transform="translate(24,33) scale(0.42)" fill="#FFFFFF">
            <path transform="rotate(-52)" d="M0,0 C -9,-16 -6,-38 0,-48 C 6,-38 9,-16 0,0 Z" />
            <path transform="rotate(-26)" d="M0,0 C -9,-16 -6,-38 0,-48 C 6,-38 9,-16 0,0 Z" />
            <path d="M0,0 C -9,-16 -6,-44 0,-54 C 6,-44 9,-16 0,0 Z" />
            <path transform="rotate(26)" d="M0,0 C -9,-16 -6,-38 0,-48 C 6,-38 9,-16 0,0 Z" />
            <path transform="rotate(52)" d="M0,0 C -9,-16 -6,-38 0,-48 C 6,-38 9,-16 0,0 Z" />
          </g>
        </svg>
        <span class="logo__word">
          <span class="logo__name">Druza</span>
          <span class="logo__sub">Semi Joias · Prata</span>
        </span>
      `;
    }
    if (actions) {
      actions.innerHTML = `
        <button class="icon-btn" type="button" aria-label="Busca em breve" aria-disabled="true" title="Busca em breve" disabled>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg>
        </button>
        <button class="icon-btn" type="button" aria-label="Minha conta em breve" aria-disabled="true" title="Minha conta em breve" disabled>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0" stroke-linecap="round"/></svg>
        </button>
        <button class="icon-btn" type="button" aria-label="Abrir sacola" aria-controls="cart-drawer" aria-expanded="false" data-open="cart-drawer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0" stroke-linecap="round"/></svg>
          <span class="cart-count">0</span>
        </button>
      `;
    }
    if (!nav) return;
    const active = product.category;
    nav.className = 'main-nav';
    nav.innerHTML = `
      <ul>
        <li class="main-nav__item">
          <a class="main-nav__link" href="../produtos/anel-coracao-esmeralda.html"${active === 'aneis' ? ' aria-current="page"' : ''}>Anéis</a>
          <div class="mega-menu" aria-label="Opções de anéis">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Anéis</strong>
                <a href="../produtos/anel-coracao-esmeralda.html">Anel coração</a>
                <a href="../produtos/anel-paraiba-quadrado.html">Anel Paraíba</a>
                <a href="../produtos/anel-coracao-esmeralda.html#faq-title">Tamanhos de exemplo</a>
              </div>
              <div class="mega-menu__col">
                <strong>Pedras</strong>
                <a href="../produtos/anel-coracao-esmeralda.html#desc-title">Esmeralda</a>
                <a href="../produtos/anel-paraiba-quadrado.html">Paraíba</a>
                <a href="../index.html#categorias">Prata cravejada</a>
              </div>
              <a class="mega-menu__feature" href="../produtos/anel-coracao-esmeralda.html">
                <span class="ph ph--1x1" role="img" aria-label="Placeholder de anel em destaque.">
                  <strong class="ph__title">Foto em breve</strong>
                  <span class="ph__tag">placeholder</span>
                </span>
                <span>Escolha de presente</span>
              </a>
            </div>
          </div>
        </li>
        <li class="main-nav__item">
          <a class="main-nav__link" href="../brincos.html"${active === 'brincos' ? ' aria-current="page"' : ''}>Brincos</a>
          <div class="mega-menu" aria-label="Opções de brincos">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Brincos</strong>
                <a href="../produtos/brinco-gota-esmeralda.html">Gotas</a>
                <a href="../produtos/argolinha-paraiba.html">Argolinhas</a>
                <a href="../produtos/brinco-ponto-luz.html">Ponto de luz</a>
              </div>
              <div class="mega-menu__col">
                <strong>Estilo</strong>
                <a href="../brincos.html#brincos-title">Para o dia</a>
                <a href="../brincos.html#editorial-brincos">Para noite</a>
                <a href="../brincos.html#brincos-title">Conjuntos</a>
              </div>
              <a class="mega-menu__feature" href="../brincos.html">
                <span class="ph ph--1x1" role="img" aria-label="Placeholder de brinco em destaque.">
                  <strong class="ph__title">Foto em breve</strong>
                  <span class="ph__tag">placeholder</span>
                </span>
                <span>Brincos de exemplo</span>
              </a>
            </div>
          </div>
        </li>
        <li class="main-nav__item">
          <a class="main-nav__link" href="../produtos/pulseira-riviera-prata.html"${active === 'pulseiras' ? ' aria-current="page"' : ''}>Pulseiras</a>
          <div class="mega-menu" aria-label="Opções de pulseiras">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Pulseiras</strong>
                <a href="../produtos/pulseira-riviera-prata.html">Riviera</a>
                <a href="../index.html#novidades">Braceletes</a>
                <a href="../index.html#novidades">Delicadas</a>
              </div>
              <div class="mega-menu__col">
                <strong>Acabamento</strong>
                <a href="../cuidados.html">Prata 925</a>
                <a href="../produtos/pulseira-riviera-prata.html">Pedras verdes</a>
                <a href="../index.html#presentes">Para presentear</a>
              </div>
              <a class="mega-menu__feature" href="../produtos/pulseira-riviera-prata.html">
                <span class="ph ph--1x1" role="img" aria-label="Placeholder de pulseira em destaque.">
                  <strong class="ph__title">Foto em breve</strong>
                  <span class="ph__tag">placeholder</span>
                </span>
                <span>Pulseiras de exemplo</span>
              </a>
            </div>
          </div>
        </li>
        <li class="main-nav__item">
          <a class="main-nav__link" href="../index.html#colecoes">Coleções</a>
          <div class="mega-menu" aria-label="Opções de coleções">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Coleções</strong>
                <a href="../index.html#colecoes">Pedras verdes</a>
                <a href="../index.html#novidades">Favoritas da casa</a>
                <a href="../index.html#presentes">Presentes</a>
              </div>
              <div class="mega-menu__col">
                <strong>Por momento</strong>
                <a href="../index.html#mundo-title">Dia a dia</a>
                <a href="../index.html#nova-title">Nova coleção</a>
                <a href="../cuidados.html">Cuidados</a>
              </div>
              <a class="mega-menu__feature" href="../index.html#colecoes">
                <span class="ph ph--1x1" role="img" aria-label="Placeholder de coleção em destaque.">
                  <strong class="ph__title">Foto em breve</strong>
                  <span class="ph__tag">placeholder</span>
                </span>
                <span>Coleção de exemplo</span>
              </a>
            </div>
          </div>
        </li>
        <li><a href="../index.html#presentes">Presentes</a></li>
        <li><a href="../index.html#sobre">Sobre</a></li>
      </ul>
    `;
  }

  function renderGallery() {
    const main = $('[data-product-main]');
    const thumbs = $('[data-product-thumbs]');
    if (!main || !thumbs) return;

    main.replaceChildren();
    thumbs.replaceChildren();

    const gallery = product.realImage && product.gallery?.length
      ? product.gallery
      : (product.realImage && product.image ? [{ image: product.image, alt: product.imageAlt }] : []);

    if (!gallery.length) {
      main.append(makePlaceholder(product.placeholderDescription));
      return;
    }

    const image = document.createElement('img');
    image.src = gallery[0].image;
    image.alt = gallery[0].alt || product.imageAlt || product.name;
    image.width = 900;
    image.height = 1100;
    image.decoding = 'async';
    image.fetchPriority = 'high';
    main.append(image);

    gallery.forEach((item) => {
      const li = document.createElement('li');
      const thumb = document.createElement('img');
      thumb.src = item.image;
      thumb.alt = item.alt || product.imageAlt || product.name;
      thumb.width = 120;
      thumb.height = 120;
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      li.append(thumb);
      thumbs.append(li);
    });
  }

  function renderVariation() {
    const label = $('[data-product-variation-label]');
    const select = $('#ring-size');
    if (!label || !select) return;

    label.textContent = product.variationLabel || 'Tamanho';
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = product.sizes?.length === 1 ? 'Escolha a opção' : 'Escolha o tamanho';
    select.append(empty);
    (product.sizes || ['Único']).forEach((size) => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size;
      select.append(option);
    });
  }

  function renderRelated() {
    const grid = $('[data-product-related]');
    if (!grid) return;
    const related = products.filter((item) => item.id !== product.id && (item.related || item.featured)).slice(0, 3);
    if (!related.length) return;
    grid.replaceChildren();
    related.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'product-card';
      const media = item.realImage && item.image
        ? `<img src="${item.image}" width="800" height="1000" loading="lazy" decoding="async" alt="${item.imageAlt || item.name}" />`
        : `<span class="ph ph--4x5" role="img" aria-label="${item.imageAlt || 'Foto em breve do produto.'}"><strong class="ph__title">Foto em breve</strong><p class="ph__desc">${item.placeholderDescription || 'Entrará uma imagem real desta peça.'}</p><span class="ph__tag">placeholder</span></span>`;
      article.innerHTML = [
        `<a class="product-card__link" href="${item.url}">`,
        '<span class="product-card__media">',
        media,
        '</span>',
        `<span class="product-card__name">${item.name}</span>`,
        '</a>',
        `<span class="price">${formatMoney(item.priceCents)}</span>`,
        `<span class="product-card__parcela">${item.installments || ''}</span>`
      ].join('');
      grid.append(article);
    });
  }

  function renderJsonLd() {
    const node = $('[data-product-json]');
    if (!node) return;
    const canonical = `https://druza.com.br/produtos/${product.id}.html`;
    node.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      image: product.realImage && product.image ? [`https://druza.com.br/${product.image.replace(/^\.\.\//, '')}`] : [],
      description: product.detail || product.description,
      brand: { '@type': 'Brand', name: 'Druza' },
      sku: product.sku,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'BRL',
        price: (product.priceCents / 100).toFixed(2),
        availability: 'https://schema.org/InStock',
        url: canonical,
        seller: { '@type': 'Organization', name: 'Druza Semi Joias' }
      }
    });
  }

  document.title = `${product.name} - Druza Semi Joias`;
  renderProductDropdownNav();
  setAttr('link[rel="canonical"]', 'href', `https://druza.com.br/produtos/${product.id}.html`);
  setAttr('meta[name="description"]', 'content', product.detail || product.description || product.name);
  setAttr('meta[property="og:title"]', 'content', `${product.name} - Druza Semi Joias`);
  setAttr('meta[property="og:description"]', 'content', product.detail || product.description || product.name);
  if (product.realImage && product.image) {
    setAttr('meta[property="og:image"]', 'content', `https://druza.com.br/${product.image.replace(/^\.\.\//, '')}`);
    setAttr('meta[property="og:image:alt"]', 'content', product.imageAlt || product.name);
  }

  setText('[data-product-category]', product.categoryLabel || 'Produtos');
  setAttr('[data-product-category-link]', 'href', product.category === 'brincos' ? '../brincos.html' : '../index.html#categorias');
  setText('[data-product-crumb]', product.name);
  setText('[data-product-name]', product.name);
  setText('[data-product-rating]', '★★★★★');
  setText('[data-product-price]', formatMoney(product.priceCents));
  setText('[data-product-installments]', product.installments || '');
  setText('[data-product-description]', product.description || product.detail || '');
  setText('[data-product-material]', product.material || 'Prata 925');
  setText('[data-product-stone]', product.stoneLabel || 'Pedra de exemplo');
  setText('[data-product-finish]', product.finish || 'Ródio');
  setText('[data-product-measurements]', product.measurements || 'Medidas em breve');
  setText('[data-sticky-price]', formatMoney(product.priceCents));

  renderVariation();
  renderGallery();
  renderRelated();
  renderJsonLd();
})();

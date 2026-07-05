/* =====================================================================
   DRUZA — product-page.js
   Renderiza a página de produto a partir do catálogo (DRUZA_CATALOG):
   nas páginas fixas (produtos/*.html) via window.DRUZA_PRODUCT_ID, e na
   genérica (produto.html) via ?slug= — o que permite que produtos novos
   criados no painel admin tenham página comprável sem HTML próprio.
   Re-renderiza preço/estoque quando o catálogo ao vivo chega
   (DRUZA_CATALOG_READY). Requer js/catalog.js carregado antes.
   ===================================================================== */
(function () {
  'use strict';

  const $ = (selector, ctx = document) => ctx.querySelector(selector);
  const $$ = (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector));

  // Base de rota: '' na raiz, '../' dentro de /produtos/. Usada tanto para
  // os links do menu quanto para resolver a URL de peças relacionadas.
  const routeBase = (window.DRUZA_ROUTE_BASE !== undefined)
    ? window.DRUZA_ROUTE_BASE
    : (window.location.pathname.includes('/produtos/') ? '../' : '');
  const route = (path) => routeBase + path;

  function getProducts() {
    return (window.DRUZA_CATALOG && window.DRUZA_CATALOG.products) || [];
  }

  // Id do produto: DRUZA_PRODUCT_ID (páginas fixas em /produtos/) ou
  // ?slug= (página genérica produto.html, inclusive produtos novos criados
  // no painel que ainda não têm HTML próprio).
  function resolveId() {
    if (window.DRUZA_PRODUCT_ID) return window.DRUZA_PRODUCT_ID;
    return new URLSearchParams(window.location.search).get('slug') || null;
  }

  function findProduct(id) {
    const products = getProducts();
    if (id) {
      const hit = products.find((item) => item.id === id);
      if (hit) return hit;
    }
    // Fallback ao primeiro só nas páginas fixas (legadas). Numa página
    // genérica ?slug com slug inexistente, retorna null → "não encontrado".
    return window.DRUZA_PRODUCT_ID ? products[0] : null;
  }

  const productId = resolveId();
  let product = null;

  function formatMoney(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
  }

  // Escapa texto interpolado em innerHTML. Nome/categoria de produto podem
  // vir do banco (editáveis pelo painel) — nunca injetar cru no DOM.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
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
    const nav = $('.site-header .content-nav') || $('.site-header .main-nav');
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
        <a class="icon-btn" href="${route('login.html')}" aria-label="Minha conta" title="Minha conta">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0" stroke-linecap="round"/></svg>
        </a>
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
          <a class="main-nav__link" href="${route('produtos/anel-coracao-esmeralda.html')}"${active === 'aneis' ? ' aria-current="page"' : ''}>Anéis</a>
          <div class="mega-menu" aria-label="Opções de anéis">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Anéis</strong>
                <a href="${route('produtos/anel-coracao-esmeralda.html')}">Anel coração</a>
                <a href="${route('produtos/anel-paraiba-quadrado.html')}">Anel Paraíba</a>
                <a href="${route('catalogo.html')}">Ver todos</a>
              </div>
              <div class="mega-menu__col">
                <strong>Pedras</strong>
                <a href="${route('produtos/anel-coracao-esmeralda.html')}">Esmeralda</a>
                <a href="${route('produtos/anel-paraiba-quadrado.html')}">Paraíba</a>
                <a href="${route('index.html')}#categorias">Prata cravejada</a>
              </div>
              <a class="mega-menu__feature" href="${route('produtos/anel-coracao-esmeralda.html')}">
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
          <a class="main-nav__link" href="${route('brincos.html')}"${active === 'brincos' ? ' aria-current="page"' : ''}>Brincos</a>
          <div class="mega-menu" aria-label="Opções de brincos">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Brincos</strong>
                <a href="${route('produtos/brinco-gota-esmeralda.html')}">Gotas</a>
                <a href="${route('produtos/argolinha-paraiba.html')}">Argolinhas</a>
                <a href="${route('produtos/brinco-ponto-luz.html')}">Ponto de luz</a>
              </div>
              <div class="mega-menu__col">
                <strong>Estilo</strong>
                <a href="${route('brincos.html')}#brincos-title">Para o dia</a>
                <a href="${route('brincos.html')}#editorial-brincos">Para noite</a>
                <a href="${route('brincos.html')}#brincos-title">Conjuntos</a>
              </div>
              <a class="mega-menu__feature" href="${route('brincos.html')}">
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
          <a class="main-nav__link" href="${route('produtos/pulseira-riviera-prata.html')}"${active === 'pulseiras' ? ' aria-current="page"' : ''}>Pulseiras</a>
          <div class="mega-menu" aria-label="Opções de pulseiras">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Pulseiras</strong>
                <a href="${route('produtos/pulseira-riviera-prata.html')}">Riviera</a>
                <a href="${route('catalogo.html')}">Ver todas</a>
              </div>
              <div class="mega-menu__col">
                <strong>Acabamento</strong>
                <a href="${route('cuidados.html')}">Prata 925</a>
                <a href="${route('produtos/pulseira-riviera-prata.html')}">Pedras verdes</a>
                <a href="${route('index.html')}#presentes">Para presentear</a>
              </div>
              <a class="mega-menu__feature" href="${route('produtos/pulseira-riviera-prata.html')}">
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
          <a class="main-nav__link" href="${route('catalogo.html')}">Coleções</a>
          <div class="mega-menu" aria-label="Opções de coleções">
            <div class="container mega-menu__inner">
              <div class="mega-menu__col">
                <strong>Coleções</strong>
                <a href="${route('catalogo.html')}">Todas as peças</a>
                <a href="${route('index.html')}#novidades">Favoritas da casa</a>
                <a href="${route('index.html')}#presentes">Presentes</a>
              </div>
              <div class="mega-menu__col">
                <strong>Por momento</strong>
                <a href="${route('index.html')}#mundo-title">Dia a dia</a>
                <a href="${route('index.html')}#nova-title">Nova coleção</a>
                <a href="${route('cuidados.html')}">Cuidados</a>
              </div>
              <a class="mega-menu__feature" href="${route('catalogo.html')}">
                <span class="ph ph--1x1" role="img" aria-label="Placeholder de coleção em destaque.">
                  <strong class="ph__title">Foto em breve</strong>
                  <span class="ph__tag">placeholder</span>
                </span>
                <span>Coleção de exemplo</span>
              </a>
            </div>
          </div>
        </li>
        <li><a href="${route('index.html')}#presentes">Presentes</a></li>
        <li><a href="${route('index.html')}#sobre">Sobre</a></li>
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
    const related = getProducts()
      .filter((item) => item.id !== product.id && (item.related || item.featured))
      .slice(0, 3);
    if (!related.length) return;
    grid.replaceChildren();
    related.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'product-card';
      const media = item.realImage && item.image
        ? `<img src="${esc(item.image)}" width="800" height="1000" loading="lazy" decoding="async" alt="${esc(item.imageAlt || item.name)}" />`
        : `<span class="ph ph--4x5" role="img" aria-label="${esc(item.imageAlt || 'Foto em breve do produto.')}"><strong class="ph__title">Foto em breve</strong><p class="ph__desc">${esc(item.placeholderDescription || 'Entrará uma imagem real desta peça.')}</p><span class="ph__tag">placeholder</span></span>`;
      article.innerHTML = [
        `<a class="product-card__link" href="${esc(item.url)}">`,
        '<span class="product-card__media">',
        media,
        '</span>',
        `<span class="product-card__name">${esc(item.name)}</span>`,
        '</a>',
        `<span class="price">${formatMoney(item.priceCents)}</span>`,
        `<span class="product-card__parcela">${item.inStock === false ? 'Esgotado no momento' : esc(item.installments || '')}</span>`
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
        availability: product.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        url: canonical,
        seller: { '@type': 'Organization', name: 'Druza Semi Joias' }
      }
    });
  }

  // Reflete estoque: desabilita comprar/adicionar quando esgotado.
  function updateAvailability() {
    const soldOut = product.inStock === false;
    $$('[data-add-cart]').forEach((btn) => {
      if (soldOut) {
        if (!btn.dataset.labelOriginal) btn.dataset.labelOriginal = btn.textContent;
        btn.textContent = 'Esgotado';
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      } else if (btn.dataset.labelOriginal) {
        btn.textContent = btn.dataset.labelOriginal;
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
      }
    });
  }

  // Partes que dependem só do conteúdo estático (não mudam com o preço ao
  // vivo). Rodam uma vez — assim os handlers de thumb do main.js, ligados
  // à galeria, não são perdidos por um re-render posterior.
  function renderStaticParts() {
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
    setAttr('[data-product-category-link]', 'href', product.category === 'brincos' ? route('brincos.html') : route('catalogo.html'));
    setText('[data-product-crumb]', product.name);
    setText('[data-product-name]', product.name);
    setText('[data-product-rating]', '★★★★★');
    setText('[data-product-description]', product.description || product.detail || '');
    setText('[data-product-material]', product.material || 'Prata 925');
    setText('[data-product-stone]', product.stoneLabel || 'Pedra de exemplo');
    setText('[data-product-finish]', product.finish || 'Ródio');
    setText('[data-product-measurements]', product.measurements || 'Medidas em breve');
    renderVariation();
    renderGallery();
  }

  // Partes que dependem do preço/estoque ao vivo — podem re-rodar quando o
  // catálogo do banco chega, sem quebrar interações.
  function renderLiveParts() {
    setText('[data-product-price]', formatMoney(product.priceCents));
    setText('[data-product-installments]', product.installments || '');
    setText('[data-sticky-price]', formatMoney(product.priceCents));
    renderRelated();
    renderJsonLd();
    updateAvailability();
  }

  function renderAll() {
    renderStaticParts();
    renderLiveParts();
  }

  function renderNotFound() {
    document.title = 'Produto não encontrado - Druza Semi Joias';
    setText('[data-product-name]', 'Produto não encontrado');
    setText('[data-product-crumb]', 'Produto não encontrado');
    setText('[data-product-description]', 'Esta peça não está disponível. Veja todas as peças no catálogo.');
    setText('[data-product-price]', '');
    setText('[data-product-installments]', '');
    const main = $('[data-product-main]');
    if (main) {
      main.replaceChildren();
      const wrap = document.createElement('div');
      wrap.className = 'ph ph--4x5';
      wrap.setAttribute('role', 'img');
      wrap.setAttribute('aria-label', 'Produto não encontrado.');
      wrap.innerHTML = '<strong class="ph__title">Indisponível</strong><p class="ph__desc">Esta peça não foi encontrada.</p>';
      main.append(wrap);
    }
    $$('[data-add-cart]').forEach((btn) => { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); });
  }

  // 1ª renderização: com o conteúdo estático (instantânea). Numa página
  // genérica ?slug de produto que só existe no banco, `product` é null aqui
  // e a 1ª renderização acontece quando o catálogo ao vivo chegar.
  product = findProduct(productId);
  if (product) renderAll();

  if (window.DRUZA_CATALOG_READY) {
    window.DRUZA_CATALOG_READY.then(() => {
      const live = findProduct(productId);
      if (!live) {
        if (!product) renderNotFound();
        return;
      }
      const wasEmpty = !product;
      product = live;
      if (wasEmpty) renderAll();     // página genérica: primeira renderização agora
      else renderLiveParts();        // página fixa: só atualiza preço/estoque/relacionados
    });
  }
})();

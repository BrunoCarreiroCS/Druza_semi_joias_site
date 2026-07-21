/* =====================================================================
   DRUZA — storefront.js
   Monta a vitrine (catálogo, destaques da home e ficha do produto) a
   partir do banco, para que uma peça cadastrada no painel apareça na
   loja sem ninguém editar HTML.

   Requer, ANTES deste script:
     <script src="js/config.public.js"></script>
   e roda junto com js/druza.js (sacola, filtros, galeria).

   Fala direto com o PostgREST do Supabase usando a chave pública. Não
   carrega o SDK: a leitura do catálogo é uma requisição GET simples, e
   a política de RLS `products_select_active` já garante que só produto
   ativo sai do banco.

   Degradação graciosa: se a requisição falhar, o HTML estático que já
   está na página continua no ar. A loja nunca fica em branco por causa
   de uma instabilidade de rede.
   ===================================================================== */
(function () {
  'use strict';

  var cfg = window.DRUZA_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  var REST = cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
  var PRODUCT_FIELDS = [
    'id', 'slug', 'name', 'category', 'collection', 'tags',
    'price_cents', 'promo_price_cents', 'promo_starts_at', 'promo_ends_at',
    'compare_at_price_cents', 'featured', 'stock_quantity',
    'short_description', 'long_description', 'attributes',
    'seo_title', 'seo_description',
    'product_images(url,alt,position,is_primary)',
    'categories(slug,name)'
  ].join(',');

  var FREE_SHIP_CENTS = 19900;
  var INSTALLMENTS = 6;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function brl(cents) {
    return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL'
    });
  }

  function slugify(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036F]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /* O mesmo cálculo de public.effective_price_cents, para a vitrine
     mostrar exatamente o preço que o servidor vai cobrar no checkout. */
  function effectivePriceCents(p) {
    var promo = p.promo_price_cents;
    if (promo == null) return p.price_cents;
    var now = Date.now();
    if (p.promo_starts_at && Date.parse(p.promo_starts_at) > now) return p.price_cents;
    if (p.promo_ends_at && Date.parse(p.promo_ends_at) <= now) return p.price_cents;
    return promo;
  }

  function isOnPromo(p) { return effectivePriceCents(p) !== p.price_cents; }

  function images(p) {
    return (p.product_images || []).slice().sort(function (a, b) {
      return Number(a.position || 0) - Number(b.position || 0);
    });
  }

  function primaryImage(p) {
    var list = images(p);
    for (var i = 0; i < list.length; i++) if (list[i].is_primary) return list[i];
    return list[0] || null;
  }

  function attr(p, key) {
    var a = p.attributes || {};
    return a[key] == null || a[key] === '' ? null : a[key];
  }

  function stoneOf(p) {
    var pedra = attr(p, 'pedra');
    return pedra ? slugify(pedra) : 'prata';
  }

  function categoryName(p) {
    return (p.categories && p.categories.name) || p.category || '';
  }

  function productUrl(p) { return 'produto.html?slug=' + encodeURIComponent(p.slug); }

  function get(path) {
    return fetch(REST + path, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        Accept: 'application/json'
      }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /* ── Cartão de produto ─────────────────────────────────── */
  function placeholderMedia(label) {
    return '<span class="ph" style="aspect-ratio:4/5">' +
      '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--silver)" stroke-width="1.5">' +
      '<path d="M5 4c0 6 3 8 7 8s7-2 7-8"/><circle cx="12" cy="16" r="2.5"/></svg>' +
      '<span style="font-family:var(--serif);font-size:1.05rem;color:var(--ink)">Foto em breve</span>' +
      '<span class="ph__pill">' + esc(label || 'peça') + '</span></span>';
  }

  function cardMedia(p) {
    var image = primaryImage(p);
    if (!image) return placeholderMedia(categoryName(p));
    return '<span class="card-media" style="aspect-ratio:4/5">' +
      '<img src="' + esc(image.url) + '" alt="' + esc(image.alt || p.name) + '" loading="lazy"></span>';
  }

  function cardTag(p) {
    if (Number(p.stock_quantity) <= 0) {
      return '<span class="pcard__tag pcard__tag--soft">Esgotado</span>';
    }
    if (isOnPromo(p)) return '<span class="pcard__tag">Promoção</span>';
    if (p.featured) return '<span class="pcard__tag pcard__tag--soft">Seleção da casa</span>';
    return '';
  }

  function priceHtml(p) {
    var price = effectivePriceCents(p);
    var previous = isOnPromo(p) ? p.price_cents : p.compare_at_price_cents;
    var previousHtml = previous && previous > price
      ? '<s style="color:var(--muted);font-size:.85em;margin-right:8px">' + esc(brl(previous)) + '</s>'
      : '';
    return '<p class="pcard__price">' + previousHtml + esc(brl(price)) + '</p>';
  }

  function productCard(p) {
    var price = effectivePriceCents(p);
    return '<article class="pcard card--lift" data-item' +
      ' data-cat="' + esc(p.category || '') + '"' +
      ' data-stone="' + esc(stoneOf(p)) + '"' +
      ' data-price="' + esc((price / 100).toFixed(2)) + '">' +
      cardTag(p) +
      '<a href="' + esc(productUrl(p)) + '">' + cardMedia(p) + '</a>' +
      '<h3>' + esc(p.name) + '</h3>' +
      priceHtml(p) +
      '<p class="pcard__inst">' + INSTALLMENTS + '× de ' +
        esc(brl(Math.round(price / INSTALLMENTS))) + ' sem juros</p>' +
      '</article>';
  }

  /* ── Catálogo ──────────────────────────────────────────── */
  function renderCategoryChips(categories, products) {
    var wrap = $('[data-catalog-categories]');
    if (!wrap) return;

    var used = {};
    products.forEach(function (p) { if (p.category) used[p.category] = true; });

    var chips = ['<button class="chip is-active" data-filter="cat" data-val="all">Tudo</button>'];
    categories.forEach(function (c) {
      if (!used[c.slug]) return;
      chips.push('<button class="chip" data-filter="cat" data-val="' + esc(c.slug) + '">' +
        esc(c.name) + '</button>');
    });
    if (chips.length > 1) wrap.innerHTML = chips.join('');
  }

  function renderStoneChips(products) {
    var wrap = $('[data-catalog-stones]');
    if (!wrap) return;

    var labels = {};
    products.forEach(function (p) {
      var pedra = attr(p, 'pedra');
      if (pedra) labels[slugify(pedra)] = pedra;
    });

    var keys = Object.keys(labels).sort();
    if (!keys.length) { wrap.hidden = true; return; }

    var chips = ['<button class="chip is-active" data-filter="stone" data-val="all">Todas as pedras</button>'];
    keys.forEach(function (key) {
      chips.push('<button class="chip" data-filter="stone" data-val="' + esc(key) + '">' +
        esc(labels[key]) + '</button>');
    });
    chips.push('<button class="chip" data-filter="stone" data-val="prata">Só prata</button>');
    wrap.hidden = false;
    wrap.innerHTML = chips.join('');
  }

  function renderCatalog() {
    var grid = $('[data-catalog]');
    if (!grid) return;

    Promise.all([
      get('/products?select=' + encodeURIComponent(PRODUCT_FIELDS) +
        '&status=eq.active&order=featured.desc,created_at.desc'),
      get('/categories?select=slug,name,sort_order&active=eq.true&order=sort_order.asc,name.asc')
    ]).then(function (results) {
      var products = results[0] || [];
      var categories = results[1] || [];
      if (!products.length) return;

      grid.innerHTML = products.map(productCard).join('');
      renderCategoryChips(categories, products);
      renderStoneChips(products);

      var shop = window.DruzaShop;
      if (shop) {
        // Links como catalogo.html?cat=aneis passam a valer de verdade.
        var wanted = new URLSearchParams(location.search).get('cat');
        if (wanted && products.some(function (p) { return p.category === wanted; })) {
          shop.setCatalogFilter('cat', wanted);
        } else {
          shop.refreshCatalog();
        }
      }
    }).catch(function () {
      /* Mantém a grade estática que já está na página. */
    });
  }

  /* ── Destaques da home ─────────────────────────────────── */
  function renderFeatured() {
    var grid = $('[data-featured]');
    if (!grid) return;

    get('/products?select=' + encodeURIComponent(PRODUCT_FIELDS) +
      '&status=eq.active&featured=eq.true&order=created_at.desc&limit=3')
      .then(function (products) {
        if (!products || !products.length) return;
        grid.innerHTML = products.map(productCard).join('');
      })
      .catch(function () { /* mantém os destaques estáticos */ });
  }

  /* ── Ficha do produto ──────────────────────────────────── */
  var SPEC_LABELS = [
    ['tipo_peca', 'Tipo'],
    ['material', 'Material'],
    ['banho', 'Banho'],
    ['cor', 'Cor'],
    ['pedra', 'Pedra'],
    ['dimensoes', 'Dimensões'],
    ['comprimento', 'Comprimento'],
    ['peso', 'Peso'],
    ['tamanho', 'Tamanho'],
    ['acabamento', 'Acabamento'],
    ['garantia', 'Garantia'],
    ['observacoes', 'Observações']
  ];

  var BOOLEAN_SPECS = [
    ['ajustavel', 'Regulável'],
    ['hipoalergenico', 'Hipoalergênico'],
    ['sem_niquel', 'Sem níquel']
  ];

  function specsHtml(p) {
    var rows = [];
    SPEC_LABELS.forEach(function (pair) {
      var value = attr(p, pair[0]);
      if (value) {
        rows.push('<div class="specs__row"><dt class="specs__k">' + esc(pair[1]) +
          '</dt><dd class="specs__v">' + esc(value) + '</dd></div>');
      }
    });
    BOOLEAN_SPECS.forEach(function (pair) {
      var value = attr(p, pair[0]);
      if (value === true || value === false) {
        rows.push('<div class="specs__row"><dt class="specs__k">' + esc(pair[1]) +
          '</dt><dd class="specs__v">' + (value ? 'Sim' : 'Não') + '</dd></div>');
      }
    });
    return rows.length ? '<dl class="specs">' + rows.join('') + '</dl>' : '';
  }

  function galleryHtml(p) {
    var list = images(p);
    if (!list.length) return null;
    var main = primaryImage(p);
    return {
      main: main,
      thumbs: list.map(function (image, index) {
        return '<button class="thumb' + (image === main ? ' is-active' : '') + '" data-thumb' +
          ' data-src="' + esc(image.url) + '" aria-label="Vista ' + (index + 1) + '">' +
          '<img src="' + esc(image.url) + '" alt="" loading="lazy"></button>';
      }).join('')
    };
  }

  function setText(selector, value) {
    var el = $(selector);
    if (el && value != null) el.textContent = value;
  }

  function renderProductPage() {
    var root = $('[data-pdp]');
    if (!root) return;

    var slug = new URLSearchParams(location.search).get('slug');
    if (!slug) return;

    get('/products?select=' + encodeURIComponent(PRODUCT_FIELDS) +
      '&status=eq.active&slug=eq.' + encodeURIComponent(slug) + '&limit=1')
      .then(function (rows) {
        var p = rows && rows[0];
        if (!p) {
          var missing = $('[data-pdp-missing]');
          if (missing) {
            missing.hidden = false;
            root.hidden = true;
          }
          return;
        }

        var price = effectivePriceCents(p);
        var soldOut = Number(p.stock_quantity) <= 0;

        document.title = (p.seo_title || p.name) + ' — Druza Semi Joias';
        var meta = $('meta[name="description"]');
        if (meta && (p.seo_description || p.short_description)) {
          meta.setAttribute('content', p.seo_description || p.short_description);
        }

        setText('[data-pdp-name]', p.name);
        setText('[data-pdp-eyebrow]', [categoryName(p), attr(p, 'pedra')].filter(Boolean).join(' · '));
        setText('[data-pdp-crumb-name]', p.name);
        setText('[data-pdp-tagline]', p.short_description || '');

        var crumbCategory = $('[data-pdp-crumb-category]');
        if (crumbCategory && p.category) {
          crumbCategory.textContent = categoryName(p);
          crumbCategory.setAttribute('href', 'catalogo.html?cat=' + encodeURIComponent(p.category));
        }

        var priceEl = $('[data-pdp-price]');
        if (priceEl) {
          var previous = isOnPromo(p) ? p.price_cents : p.compare_at_price_cents;
          priceEl.innerHTML = (previous && previous > price
            ? '<s style="color:var(--muted);font-size:.6em;margin-right:10px">' + esc(brl(previous)) + '</s>'
            : '') + esc(brl(price));
        }

        var instEl = $('[data-pdp-inst]');
        if (instEl) {
          var missingForFreeShip = FREE_SHIP_CENTS - price;
          instEl.textContent = INSTALLMENTS + '× de ' + brl(Math.round(price / INSTALLMENTS)) +
            ' sem juros' + (missingForFreeShip <= 0
              ? ' · frete grátis'
              : ' · faltam ' + brl(missingForFreeShip) + ' para o frete grátis');
        }

        var gallery = galleryHtml(p);
        var mainImg = $('[data-gallery-main] img');
        if (gallery && mainImg) {
          mainImg.src = gallery.main.url;
          mainImg.alt = gallery.main.alt || p.name;
          mainImg.style.objectPosition = 'center';
          var thumbs = $('[data-pdp-thumbs]');
          if (thumbs) thumbs.innerHTML = gallery.thumbs;
        } else if (!gallery) {
          var galleryRoot = $('[data-pdp-gallery]');
          if (galleryRoot) galleryRoot.innerHTML = placeholderMedia(categoryName(p));
        }

        var specs = $('[data-pdp-specs]');
        if (specs) {
          var html = specsHtml(p);
          if (html) specs.innerHTML = html;
          else {
            var block = specs.closest('details');
            if (block) block.hidden = true;
          }
        }

        var care = $('[data-pdp-care]');
        var careText = attr(p, 'conservacao');
        if (care && careText) care.textContent = careText;

        var description = $('[data-pdp-description]');
        if (description && p.long_description) {
          description.innerHTML = String(p.long_description)
            .split(/\n{2,}/)
            .map(function (paragraph) { return '<p>' + esc(paragraph) + '</p>'; })
            .join('');
        }

        // Tamanho vira opção só quando a peça declara tamanhos; um seletor
        // de aro fixo numa pulseira confunde mais do que ajuda.
        var sizeBlock = $('[data-pdp-sizes]');
        var sizes = String(attr(p, 'tamanho') || '').split(/[,;/]+/)
          .map(function (s) { return s.trim(); })
          .filter(Boolean);
        if (sizeBlock) {
          if (sizes.length > 1) {
            var group = $('[data-size-group]', sizeBlock);
            if (group) {
              group.innerHTML = sizes.map(function (size, index) {
                return '<button type="button"' + (index === 0 ? ' class="is-active"' : '') + '>' +
                  esc(size) + '</button>';
              }).join('');
            }
            sizeBlock.hidden = false;
          } else {
            sizeBlock.hidden = true;
          }
        }

        var image = primaryImage(p);
        $$('[data-pdp-add]').forEach(function (button) {
          if (soldOut) {
            button.disabled = true;
            button.textContent = 'Produto indisponível';
            button.removeAttribute('data-add');
            return;
          }
          button.disabled = false;
          button.textContent = 'Adicionar à sacola';
          button.setAttribute('data-add', p.slug);
          button.setAttribute('data-name', p.name);
          button.setAttribute('data-price', (price / 100).toFixed(2));
          button.setAttribute('data-img', image ? image.url : '');
        });

        var stockNote = $('[data-pdp-stock]');
        if (stockNote) {
          var restam = Number(p.stock_quantity);
          if (soldOut) stockNote.textContent = 'Esta peça está esgotada no momento.';
          else if (restam === 1) stockNote.textContent = 'Última unidade disponível.';
          else if (restam <= 3) stockNote.textContent = 'Últimas ' + restam + ' unidades.';
          else stockNote.textContent = '';
        }

        var stickyThumb = $('[data-pdp-sticky-thumb]');
        if (stickyThumb && image) stickyThumb.src = image.url;
        setText('[data-pdp-sticky-name]', p.name);
        setText('[data-pdp-sticky-price]', brl(price) + ' · ' + INSTALLMENTS + '× de ' +
          brl(Math.round(price / INSTALLMENTS)));

        renderRelated(p);
      })
      .catch(function () { /* mantém o conteúdo estático da página */ });
  }

  function renderRelated(product) {
    var grid = $('[data-pdp-related]');
    if (!grid || !product.category) return;

    get('/products?select=' + encodeURIComponent(PRODUCT_FIELDS) +
      '&status=eq.active&category=eq.' + encodeURIComponent(product.category) +
      '&slug=neq.' + encodeURIComponent(product.slug) + '&limit=3')
      .then(function (products) {
        if (products && products.length) grid.innerHTML = products.map(productCard).join('');
      })
      .catch(function () { /* mantém os relacionados estáticos */ });
  }

  renderCatalog();
  renderFeatured();
  renderProductPage();
})();

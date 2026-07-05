/* =====================================================================
   DRUZA — catalog.js
   Catálogo do site. Duas camadas:
     1) CONTENT (estático): fotos, descrição, galeria, tamanhos — editado
        aqui no código, paint instantâneo e fallback offline.
     2) Tabela `products` (Supabase): preço, estoque, ativo, destaque —
        buscada ao vivo via REST para o preço exibido ser sempre o mesmo
        que o checkout cobra. Merge assíncrono via DRUZA_CATALOG_READY.
   Requer js/config.js carregado antes (para a camada 2; sem ele, fica
   só o estático). Consumido por main.js e product-page.js.
   ===================================================================== */
(function () {
  'use strict';

  const assetBase = window.DRUZA_ASSET_BASE || '';
  const routeBase = window.DRUZA_ROUTE_BASE || '';
  const asset = (path) => (path ? assetBase + path : '');
  const route = (path) => routeBase + path;

  // =====================================================================
  // CAMADA DE CONTEÚDO (estática): imagens, descrição, galeria, tamanhos.
  // Esse conteúdo rico ainda não vem do banco — é editado aqui no código.
  // O preço/estoque/ativo/destaque vêm AO VIVO da tabela `products` do
  // Supabase (ver merge abaixo), pra o preço exibido bater com o cobrado
  // no checkout. Aqui os price* servem só de fallback se o banco não
  // responder.
  // =====================================================================
  const CONTENT = [
    {
      id: 'anel-coracao-esmeralda',
      sku: 'EXEMPLO-ANEL-CORACAO-ESMERALDA',
      name: 'Anel Coração Esmeralda',
      category: 'aneis',
      categoryLabel: 'Anéis',
      stone: 'esmeralda',
      priceCents: 18900,
      installments: 'ou 6x de R$ 31,50 sem juros',
      image: asset('img/anel-coracao.webp'),
      imageAlt: 'Anel de prata com pedra esmeralda em formato coração.',
      url: route('produtos/anel-coracao-esmeralda.html'),
      featured: true,
      related: false,
      realImage: true,
      description: 'Um coração de pedra verde sobre prata polida, pequeno no tamanho e marcante na presença.',
      detail: 'Produto de exemplo do protótipo: anel de prata 925 com pedra verde esmeralda em formato coração.',
      material: 'Prata 925',
      stoneLabel: 'Zircônia verde esmeralda',
      finish: 'Ródio',
      measurements: 'Aro ajustável por tamanho selecionado',
      variationLabel: 'Tamanho do anel',
      sizes: ['14', '16', '18', '20'],
      gallery: [
        { image: asset('img/anel-coracao.webp'), alt: 'Anel coração esmeralda, vista frontal.' },
        { image: asset('img/anel-paraiba.webp'), alt: 'Anel com pedra Paraíba, referência de acabamento.' },
        { image: asset('img/pulseiras-riviera.webp'), alt: 'Pulseiras riviera de prata, referência de brilho.' }
      ]
    },
    {
      id: 'pulseira-riviera-prata',
      sku: 'EXEMPLO-PULSEIRA-RIVIERA-PRATA',
      name: 'Pulseira Riviera Prata',
      category: 'pulseiras',
      categoryLabel: 'Pulseiras',
      stone: 'verde',
      priceCents: 15900,
      installments: 'ou 6x de R$ 26,50 sem juros',
      image: asset('img/pulseiras-riviera.webp'),
      imageAlt: 'Pulseira riviera de prata com pedras verdes.',
      url: route('produtos/pulseira-riviera-prata.html'),
      featured: true,
      related: true,
      realImage: true,
      description: 'Uma pulseira de prata com brilho contínuo, pensada para acompanhar anéis e pontos de luz.',
      detail: 'Produto de exemplo do protótipo: pulseira riviera em prata com pedras verdes.',
      material: 'Prata 925',
      stoneLabel: 'Zircônias verdes',
      finish: 'Ródio',
      measurements: 'Comprimento de exemplo: 18 cm',
      variationLabel: 'Tamanho',
      sizes: ['Único'],
      gallery: [
        { image: asset('img/pulseiras-riviera.webp'), alt: 'Pulseira riviera de prata com pedras verdes.' },
        { image: asset('img/anel-coracao.webp'), alt: 'Anel coração usado como referência de combinação.' },
        { image: asset('img/anel-paraiba.webp'), alt: 'Anel Paraíba usado como referência de combinação.' }
      ]
    },
    {
      id: 'anel-paraiba-quadrado',
      sku: 'EXEMPLO-ANEL-PARAIBA-QUADRADO',
      name: 'Anel Paraíba Quadrado',
      category: 'aneis',
      categoryLabel: 'Anéis',
      stone: 'paraiba',
      priceCents: 21900,
      installments: 'ou 6x de R$ 36,50 sem juros',
      image: asset('img/anel-paraiba.webp'),
      imageAlt: 'Anel de prata com pedra Paraíba turquesa.',
      url: route('produtos/anel-paraiba-quadrado.html'),
      featured: true,
      related: true,
      realImage: true,
      description: 'A pedra Paraíba cria um ponto de cor luminoso sobre a prata, com presença limpa e elegante.',
      detail: 'Produto de exemplo do protótipo: anel quadrado em prata com pedra Paraíba turquesa.',
      material: 'Prata 925',
      stoneLabel: 'Zircônia Paraíba',
      finish: 'Ródio',
      measurements: 'Aro ajustável por tamanho selecionado',
      variationLabel: 'Tamanho do anel',
      sizes: ['14', '16', '18', '20'],
      gallery: [
        { image: asset('img/anel-paraiba.webp'), alt: 'Anel de prata com pedra Paraíba turquesa.' },
        { image: asset('img/anel-coracao.webp'), alt: 'Anel coração como referência de acabamento.' },
        { image: asset('img/pulseiras-riviera.webp'), alt: 'Pulseira riviera como referência de brilho.' }
      ]
    },
    {
      id: 'brinco-gota-esmeralda',
      sku: 'EXEMPLO-BRINCO-GOTA-ESMERALDA',
      name: 'Brinco Gota Esmeralda',
      category: 'brincos',
      categoryLabel: 'Brincos',
      stone: 'esmeralda',
      priceCents: 12900,
      installments: 'ou 6x de R$ 21,50 sem juros',
      image: '',
      imageAlt: 'Foto em breve do brinco gota esmeralda.',
      url: route('produtos/brinco-gota-esmeralda.html'),
      featured: false,
      related: true,
      realImage: false,
      placeholderDescription: 'Entrará uma imagem real do Brinco Gota Esmeralda em prata.',
      description: 'Uma gota verde delicada para iluminar o rosto com prata e brilho discreto.',
      detail: 'Produto de exemplo do protótipo: brinco gota em prata com pedra esmeralda.',
      material: 'Prata 925',
      stoneLabel: 'Zircônia verde esmeralda',
      finish: 'Ródio',
      measurements: 'Medidas finais em breve',
      variationLabel: 'Tamanho',
      sizes: ['Único'],
      gallery: []
    },
    {
      id: 'argolinha-paraiba',
      sku: 'EXEMPLO-ARGOLINHA-PARAIBA',
      name: 'Argolinha Paraíba',
      category: 'brincos',
      categoryLabel: 'Brincos',
      stone: 'paraiba',
      priceCents: 14900,
      installments: 'ou 6x de R$ 24,83 sem juros',
      image: '',
      imageAlt: 'Foto em breve da argolinha Paraíba.',
      url: route('produtos/argolinha-paraiba.html'),
      featured: false,
      related: true,
      realImage: false,
      placeholderDescription: 'Entrará uma imagem real da Argolinha Paraíba com pedra verde.',
      description: 'Uma argolinha delicada com ponto verde Paraíba para uso diário.',
      detail: 'Produto de exemplo do protótipo: argolinha em prata com pedra Paraíba.',
      material: 'Prata 925',
      stoneLabel: 'Zircônia Paraíba',
      finish: 'Ródio',
      measurements: 'Medidas finais em breve',
      variationLabel: 'Tamanho',
      sizes: ['Único'],
      gallery: []
    },
    {
      id: 'brinco-ponto-luz',
      sku: 'EXEMPLO-BRINCO-PONTO-LUZ',
      name: 'Brinco Ponto de Luz',
      category: 'brincos',
      categoryLabel: 'Brincos',
      stone: 'cristal',
      priceCents: 11900,
      installments: 'ou 6x de R$ 19,83 sem juros',
      image: '',
      imageAlt: 'Foto em breve do brinco ponto de luz.',
      url: route('produtos/brinco-ponto-luz.html'),
      featured: false,
      related: true,
      realImage: false,
      placeholderDescription: 'Entrará uma imagem real do Brinco Ponto de Luz em prata.',
      description: 'Um ponto de luz pequeno, limpo e fácil de combinar com outras peças.',
      detail: 'Produto de exemplo do protótipo: brinco ponto de luz em prata.',
      material: 'Prata 925',
      stoneLabel: 'Zircônia cristal',
      finish: 'Ródio',
      measurements: 'Medidas finais em breve',
      variationLabel: 'Tamanho',
      sizes: ['Único'],
      gallery: []
    },
    {
      id: 'colar-ponto-luz-paraiba',
      sku: 'EXEMPLO-COLAR-PONTO-LUZ-PARAIBA',
      name: 'Colar Ponto de Luz Paraíba',
      category: 'colares',
      categoryLabel: 'Colares',
      stone: 'paraiba',
      priceCents: 17900,
      installments: 'ou 6x de R$ 29,83 sem juros',
      image: '',
      imageAlt: 'Foto em breve do colar ponto de luz Paraíba.',
      url: route('produtos/colar-ponto-luz-paraiba.html'),
      featured: false,
      related: false,
      realImage: false,
      placeholderDescription: 'Entrará uma imagem real do colar ponto de luz com pedra Paraíba.',
      description: 'Um ponto de luz Paraíba para usar sozinho ou em composição com anéis e pulseiras.',
      detail: 'Produto de exemplo do protótipo: colar ponto de luz em prata com pedra Paraíba.',
      material: 'Prata 925',
      stoneLabel: 'Zircônia Paraíba',
      finish: 'Ródio',
      measurements: 'Corrente de exemplo: 45 cm',
      variationLabel: 'Tamanho',
      sizes: ['Único'],
      gallery: []
    }
  ];

  // Fonte de verdade inicial = conteúdo estático (paint instantâneo, e
  // fallback se o Supabase não responder). O merge abaixo substitui em
  // `products` a lista final com preços/estoque ao vivo.
  window.DRUZA_CATALOG = { products: CONTENT };

  // -------------------------------------------------------------------
  // Merge com a tabela `products` do Supabase (preço/estoque/ativo/destaque).
  // Usa REST (PostgREST) direto com a anon key — sem depender do SDK. A
  // policy `products_select_active` garante que só produtos ativos voltam.
  // -------------------------------------------------------------------
  const CATEGORY_LABELS = {
    aneis: 'Anéis', brincos: 'Brincos', pulseiras: 'Pulseiras',
    colares: 'Colares', conjuntos: 'Conjuntos'
  };

  function formatMoney(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
  }
  function installmentsFor(cents) {
    // 6x sem juros, mesma regra dos textos estáticos originais.
    return 'ou 6x de ' + formatMoney(Math.round((cents || 0) / 6)) + ' sem juros';
  }

  function syntheticContent(row) {
    // Produto que existe só no banco (criado pelo painel, sem conteúdo
    // rico ainda) — placeholder honesto de foto, comprável mesmo assim.
    return {
      id: row.slug,
      sku: row.slug.toUpperCase(),
      name: row.name,
      category: row.category || '',
      categoryLabel: CATEGORY_LABELS[row.category] || 'Peças',
      stone: '',
      image: '',
      imageAlt: 'Foto em breve de ' + row.name + '.',
      url: route('produto.html?slug=' + encodeURIComponent(row.slug)),
      related: false,
      realImage: false,
      placeholderDescription: 'Foto real de ' + row.name + ' em breve.',
      description: row.name + ' — peça da Druza em prata.',
      detail: row.name + ' — peça da Druza em prata.',
      material: 'Prata 925',
      stoneLabel: '—',
      finish: 'Ródio',
      measurements: 'Medidas em breve',
      variationLabel: 'Tamanho',
      sizes: ['Único'],
      gallery: []
    };
  }

  function mergeRow(row) {
    const base = CONTENT.find((c) => c.id === row.slug) || syntheticContent(row);
    return Object.assign({}, base, {
      // Banco manda em: existência, preço, estoque, destaque, ativo, nome, categoria.
      name: row.name || base.name,
      category: row.category || base.category,
      categoryLabel: CATEGORY_LABELS[row.category] || base.categoryLabel,
      priceCents: row.price_cents,
      installments: installmentsFor(row.price_cents),
      inStock: row.in_stock !== false,
      featured: row.featured === true,
      active: row.active !== false,
      dbBacked: true
    });
  }

  async function loadLiveCatalog() {
    const cfg = window.DRUZA_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('SEU-PROJETO')) {
      return window.DRUZA_CATALOG; // sem config → mantém estático
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const url = cfg.SUPABASE_URL.replace(/\/$/, '') +
        '/rest/v1/products?select=slug,name,category,price_cents,active,in_stock,featured&order=created_at.asc';
      const res = await fetch(url, {
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY },
        signal: controller.signal
      });
      if (!res.ok) return window.DRUZA_CATALOG;
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) return window.DRUZA_CATALOG;
      // DB é a fonte de verdade do que está à venda: a lista final é
      // exatamente o que o banco devolve (ativos), enriquecido com o
      // conteúdo estático quando o slug bate.
      window.DRUZA_CATALOG.products = rows.map(mergeRow);
      return window.DRUZA_CATALOG;
    } catch (e) {
      return window.DRUZA_CATALOG; // rede/erro/timeout → mantém estático
    } finally {
      clearTimeout(timer);
    }
  }

  // Promise que main.js / product-page.js aguardam pra re-renderizar com
  // os preços ao vivo. Nunca rejeita.
  window.DRUZA_CATALOG_READY = loadLiveCatalog();
})();

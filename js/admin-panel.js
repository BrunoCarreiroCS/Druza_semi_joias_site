/* =====================================================================
   DRUZA — admin-panel.js
   Comportamento do painel administrativo. Requer, ANTES deste script:
     js/config.public.js, supabase-js (UMD), js/auth.js, js/admin.js

   Convenções desta tela:
   - Nada de jargão técnico na interface. "Entrada de estoque", não
     "movement". "Fora da loja", não "inactive".
   - Toda ação que altera dado confirma na tela (toast) e recarrega a
     lista, para a usuária ver o resultado sem precisar adivinhar.
   - Ação destrutiva sempre pergunta antes.
   - Botão de salvar desabilita durante o envio, para o clique duplo não
     virar dois registros.
   ===================================================================== */
(function () {
  'use strict';

  var A = window.DruzaAuth;
  var D = window.DruzaAdmin;

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function brl(cents) {
    return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function centsToReais(cents) {
    if (cents == null || cents === '') return '';
    return (Number(cents) / 100).toFixed(2).replace('.', ',');
  }

  function reaisToCents(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    var normalized = text.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    var number = Number(normalized);
    return Number.isFinite(number) ? Math.round(number * 100) : NaN;
  }

  var DATE_OPTS = { timeZone: 'America/Sao_Paulo' };

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR', DATE_OPTS) : '—';
  }

  function formatDateTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', DATE_OPTS) : '—';
  }

  /* <input type="datetime-local"> só aceita o horário local sem fuso. */
  function isoToLocalInput(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function localInputToIso(value) {
    if (!value) return null;
    var date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  var toastEl = $('#toast');
  var toastTimer = null;
  function toast(message, kind) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = 'admin-toast' + (kind === 'error' ? ' is-error' : '');
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, kind === 'error' ? 6000 : 3500);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
      button.disabled = true;
      button.textContent = busyLabel || 'Salvando…';
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
    }
  }

  // ------------------------------------------------------------------
  // Modais leves: confirmação, remetente e escolha de categoria.
  //
  // Substituem window.confirm()/window.prompt() em todo o painel — uma
  // caixa cinza do sistema operacional, sem a cara do site, quebra a
  // confiança bem no meio de uma tarefa que o resto do painel ensinou a
  // usuária a fazer com calma. Os três seguem o mesmo formato (abre,
  // resolve a Promise no clique/Esc/backdrop, limpa os listeners) para
  // não precisar decorar três jeitos diferentes de fechar um modal.
  // ------------------------------------------------------------------
  function adminConfirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-modal-title').textContent = opts.title || 'Confirmar ação';
      document.getElementById('confirm-modal-message').textContent = message;
      var confirmBtn = document.getElementById('confirm-modal-confirm');
      confirmBtn.textContent = opts.confirmLabel || 'Confirmar';
      confirmBtn.className = 'btn ' + (opts.danger ? 'btn--primary' : 'btn--primary');

      function cleanup(result) {
        modal.hidden = true;
        confirmBtn.removeEventListener('click', onConfirm);
        cancelButtons.forEach(function (b) { b.removeEventListener('click', onCancel); });
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onKey(event) {
        if (event.key === 'Escape') cleanup(false);
        else if (event.key === 'Enter') cleanup(true);
      }

      var cancelButtons = Array.prototype.slice.call(modal.querySelectorAll('[data-confirm-cancel]'));
      confirmBtn.addEventListener('click', onConfirm);
      cancelButtons.forEach(function (b) { b.addEventListener('click', onCancel); });
      document.addEventListener('keydown', onKey);
      modal.hidden = false;
      confirmBtn.focus();
    });
  }

  function openSenderModal(current) {
    return new Promise(function (resolve) {
      var modal = document.getElementById('sender-modal');
      var form = document.getElementById('sender-form');
      var feedback = document.getElementById('sender-feedback');
      form.elements.name.value = current.name || '';
      form.elements.document.value = current.document || '';
      form.elements.address.value = current.address || '';
      feedback.className = 'auth-feedback';
      feedback.textContent = '';

      function cleanup(result) {
        modal.hidden = true;
        form.removeEventListener('submit', onSubmit);
        cancelButtons.forEach(function (b) { b.removeEventListener('click', onCancel); });
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onSubmit(event) {
        event.preventDefault();
        var address = form.elements.address.value.trim();
        if (!address) {
          feedback.className = 'auth-feedback is-error';
          feedback.textContent = 'Preencha o endereço do remetente.';
          return;
        }
        cleanup({
          name: form.elements.name.value.trim() || 'Druza Semi Joias',
          document: form.elements.document.value.trim(),
          address: address
        });
      }
      function onCancel() { cleanup(null); }
      function onKey(event) { if (event.key === 'Escape') cleanup(null); }

      var cancelButtons = Array.prototype.slice.call(modal.querySelectorAll('[data-sender-cancel]'));
      form.addEventListener('submit', onSubmit);
      cancelButtons.forEach(function (b) { b.addEventListener('click', onCancel); });
      document.addEventListener('keydown', onKey);
      modal.hidden = false;
      form.elements.name.focus();
    });
  }

  function pickCategoryToMove(category, others) {
    return new Promise(function (resolve) {
      var modal = document.getElementById('category-move-modal');
      var singular = category.products_count === 1;
      document.getElementById('category-move-hint').textContent =
        'A categoria "' + category.name + '" tem ' + category.products_count +
        ' produto' + (singular ? '' : 's') + '. Escolha para onde ' +
        (singular ? 'ele vai' : 'eles vão') + ' antes de excluir.';
      var select = document.getElementById('category-move-select');
      select.innerHTML = others.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('');
      var confirmBtn = document.getElementById('category-move-confirm');

      function cleanup(result) {
        modal.hidden = true;
        confirmBtn.removeEventListener('click', onConfirm);
        cancelButtons.forEach(function (b) { b.removeEventListener('click', onCancel); });
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onConfirm() { cleanup(select.value); }
      function onCancel() { cleanup(null); }
      function onKey(event) { if (event.key === 'Escape') cleanup(null); }

      var cancelButtons = Array.prototype.slice.call(modal.querySelectorAll('[data-move-cancel]'));
      confirmBtn.addEventListener('click', onConfirm);
      cancelButtons.forEach(function (b) { b.addEventListener('click', onCancel); });
      document.addEventListener('keydown', onKey);
      modal.hidden = false;
      select.focus();
    });
  }

  function emptyState(message, actionHtml) {
    return '<div class="admin-empty"><p>' + esc(message) + '</p>' + (actionHtml || '') + '</div>';
  }

  function errorState(message) {
    return '<div class="admin-empty admin-empty--error"><p>' + esc(message) + '</p></div>';
  }

  function loadingState() {
    return '<p class="field__hint">Carregando…</p>';
  }

  var ORDER_STATUS_PT = {
    pending: 'Aguardando pagamento',
    processing: 'Processando pagamento',
    paid: 'Pago',
    shipped: 'Enviado',
    delivered: 'Entregue',
    canceled: 'Cancelado',
    refunded: 'Estornado'
  };

  var PRODUCT_STATUS_PT = {
    active: 'À venda',
    inactive: 'Fora da loja',
    archived: 'Arquivado'
  };

  var MOVEMENT_PT = {
    saldo_inicial: 'Saldo inicial',
    entrada: 'Entrada de mercadoria',
    venda: 'Venda',
    reserva: 'Reserva para pedido',
    liberacao_reserva: 'Reserva liberada',
    devolucao: 'Devolução',
    troca: 'Troca',
    ajuste_positivo: 'Ajuste para mais',
    ajuste_negativo: 'Ajuste para menos',
    perda: 'Perda',
    avaria: 'Peça danificada',
    inventario: 'Correção de inventário'
  };

  var AUDIT_PT = {
    'product.create': 'Cadastrou um produto',
    'product.update': 'Editou um produto',
    'product.archive': 'Arquivou um produto',
    'product.status_change': 'Mudou a situação de um produto',
    'product.deactivate': 'Tirou um produto da loja',
    'category.create': 'Criou uma categoria',
    'category.update': 'Editou uma categoria',
    'category.delete': 'Excluiu uma categoria',
    'order.update': 'Atualizou um pedido'
  };

  function auditLabel(action) {
    if (AUDIT_PT[action]) return AUDIT_PT[action];
    if (action.indexOf('inventory.') === 0) {
      return 'Movimentou o estoque · ' + (MOVEMENT_PT[action.slice(10)] || action.slice(10));
    }
    return action;
  }

  function statusBadge(status, dictionary) {
    var label = (dictionary || ORDER_STATUS_PT)[status] || status;
    return '<span class="badge-status" data-status="' + esc(status) + '">' + esc(label) + '</span>';
  }

  function isCorreiosCode(code) {
    return /^[A-Z]{2}\d{9}BR$/.test(String(code || '').trim().toUpperCase());
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* tenta o fallback */ }
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      return true;
    } catch (_) {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Navegação entre seções
  // ------------------------------------------------------------------
  var SECTION_TITLES = {
    overview: 'Visão geral',
    orders: 'Pedidos',
    products: 'Produtos',
    inventory: 'Estoque',
    categories: 'Categorias',
    customers: 'Clientes',
    shipping: 'Envios',
    audit: 'Histórico'
  };

  var navEl = $('#admin-nav');
  var navToggle = $('#nav-toggle');
  var navScrim = $('#nav-scrim');
  var sectionTitle = $('#section-title');
  var loaded = {};

  function closeNav() {
    if (!navEl) return;
    navEl.classList.remove('is-open');
    if (navScrim) navScrim.hidden = true;
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  function showSection(name) {
    if (!SECTION_TITLES[name]) return;
    $$('.admin-panel').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
    $$('.admin-nav__link').forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-section') === name);
    });
    if (sectionTitle) sectionTitle.textContent = SECTION_TITLES[name];
    closeNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Cada seção carrega os próprios dados na primeira visita, para o
    // painel abrir rápido em vez de buscar tudo de uma vez.
    if (!loaded[name]) {
      loaded[name] = true;
      var loaders = {
        orders: loadOrders,
        products: loadProducts,
        inventory: loadInventorySection,
        categories: loadCategories,
        customers: loadCustomers,
        shipping: loadShipping,
        audit: loadAudit
      };
      if (loaders[name]) loaders[name]();
    }
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('.admin-nav__link');
    if (link) { showSection(link.getAttribute('data-section')); return; }

    var goto = event.target.closest('[data-goto]');
    if (goto) {
      showSection(goto.getAttribute('data-goto'));
      var action = goto.getAttribute('data-action');
      if (action === 'new-product') openProductForm(null);
      if (action === 'new-entry') {
        var typeField = $('#inventory-form [name="movement_type"]');
        if (typeField) { typeField.value = 'entrada'; typeField.dispatchEvent(new Event('change')); }
        var productField = $('#inventory-product-input');
        if (productField) productField.focus();
      }
    }
  });

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var open = navEl.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (navScrim) navScrim.hidden = !open;
    });
  }
  if (navScrim) navScrim.addEventListener('click', closeNav);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeNav();
  });

  // ------------------------------------------------------------------
  // Visão geral
  // ------------------------------------------------------------------
  function statCard(label, value, hint, tone) {
    return '<div class="stat-card' + (tone ? ' stat-card--' + tone : '') + '">' +
      '<span class="stat-card__label">' + esc(label) + '</span>' +
      '<strong class="stat-card__value">' + esc(value) + '</strong>' +
      (hint ? '<span class="stat-card__hint">' + esc(hint) + '</span>' : '') +
      '</div>';
  }

  function setBadge(name, count) {
    var badge = $('[data-badge="' + name + '"]');
    if (!badge) return;
    badge.textContent = count;
    badge.hidden = !count;
  }

  async function loadOverview() {
    var statsEl = $('#overview-stats');
    var result = await D.dashboard();
    if (result.error) {
      statsEl.innerHTML = errorState(result.error);
      return;
    }

    var data = result.data || {};
    var m = data.metrics || {};
    var produtos = m.produtos || {};
    var pedidos = m.pedidos || {};
    var vendas = m.vendas || {};

    statsEl.innerHTML =
      statCard('Vendas de hoje', brl(vendas.hoje_cents), 'pedidos pagos hoje') +
      statCard('Vendas dos últimos 7 dias', brl(vendas.semana_cents)) +
      statCard('Vendas dos últimos 30 dias', brl(vendas.mes_cents)) +
      statCard('Peças vendidas', m.itens_vendidos || 0, 'desde o início') +
      statCard('Pedidos aguardando envio', pedidos.aguardando_envio || 0,
        (pedidos.sem_rastreio || 0) + ' sem rastreio',
        pedidos.aguardando_envio ? 'attention' : null) +
      statCard('Aguardando pagamento', pedidos.aguardando_pagamento || 0) +
      statCard('Enviados', pedidos.enviados || 0) +
      statCard('Entregues', pedidos.entregues || 0) +
      statCard('Produtos à venda', produtos.ativos || 0,
        (produtos.itens_em_estoque || 0) + ' peças em estoque') +
      statCard('Sem estoque', produtos.sem_estoque || 0, null,
        produtos.sem_estoque ? 'warn' : null) +
      statCard('Estoque baixo', produtos.estoque_baixo || 0, null,
        produtos.estoque_baixo ? 'warn' : null) +
      statCard('Fora da loja', produtos.inativos || 0);

    setBadge('orders', pedidos.novos_24h || 0);
    setBadge('inventory', (produtos.estoque_baixo || 0) + (produtos.sem_estoque || 0));
    setBadge('shipping', pedidos.aguardando_envio || 0);

    var lowStock = data.estoque_baixo || [];
    $('#overview-low-stock').innerHTML = lowStock.length
      ? lowStock.map(function (p) {
        return '<div class="mini-row"><span>' + esc(p.name) + '</span>' +
          '<strong class="' + (p.stock_quantity > 0 ? 'is-warn' : 'is-danger') + '">' +
          (p.stock_quantity > 0 ? p.stock_quantity + ' em estoque' : 'esgotado') + '</strong></div>';
      }).join('')
      : emptyState('Nenhum produto com estoque baixo. Tudo em ordem.');

    var awaiting = data.aguardando_envio || [];
    $('#overview-shipping').innerHTML = awaiting.length
      ? awaiting.map(function (o) {
        var address = o.shipping_address_snapshot || {};
        return '<div class="mini-row"><span>' + esc(String(o.id).slice(0, 8)) +
          ' · ' + esc(address.recipient || 'sem destinatário') + '</span>' +
          '<strong>' + esc(brl(o.total_cents)) + '</strong></div>';
      }).join('')
      : emptyState('Nenhum pedido esperando postagem.');

    var recent = data.pedidos_recentes || [];
    $('#overview-orders').innerHTML = recent.length
      ? recent.map(function (o) {
        return '<div class="mini-row"><span>' + esc(String(o.id).slice(0, 8)) + ' · ' +
          formatDate(o.created_at) + '</span>' + statusBadge(o.status) + '</div>';
      }).join('')
      : emptyState('Ainda não há pedidos.');

    var movements = data.movimentacoes_recentes || [];
    $('#overview-movements').innerHTML = movements.length
      ? movements.map(function (mv) {
        var sign = mv.quantity_change > 0 ? '+' : '';
        return '<div class="mini-row"><span>' + esc(mv.product_slug) + ' · ' +
          esc(MOVEMENT_PT[mv.movement_type] || mv.movement_type) + '</span>' +
          '<strong class="' + (mv.quantity_change < 0 ? 'is-danger' : '') + '">' +
          sign + mv.quantity_change + '</strong></div>';
      }).join('')
      : emptyState('Nenhuma movimentação registrada ainda.');
  }

  // ------------------------------------------------------------------
  // Pedidos
  // ------------------------------------------------------------------
  var ordersState = { offset: 0, limit: 25, total: 0, rows: [] };

  function orderFilters() {
    return {
      status: $('#order-status-filter').value || undefined,
      search: $('#order-search').value.trim() || undefined,
      date_from: $('#order-date-from').value || undefined,
      date_to: $('#order-date-to').value || undefined,
      sort: $('#order-sort').value,
      limit: ordersState.limit,
      offset: ordersState.offset
    };
  }

  function orderRow(o) {
    var items = (o.order_items || []).map(function (item) {
      return item.qty + '× ' + esc(item.product_name);
    }).join(', ');

    return '<div class="admin-row" data-id="' + esc(o.id) + '">' +
      '<div class="admin-row__main">' +
        '<div class="admin-row__title">Pedido ' + esc(String(o.id).slice(0, 8)) + ' ' +
          statusBadge(o.status) +
          (o.inventory_shortfall ? ' <span class="badge-status" data-status="pending">Conferir estoque</span>' : '') +
        '</div>' +
        '<div class="admin-row__meta">' +
          esc(o.customer_name || o.customer_email || 'cliente sem cadastro') +
          ' · ' + formatDate(o.created_at) + ' · ' + esc(brl(o.total_cents)) +
        '</div>' +
        '<div class="admin-row__meta">' + (items || 'sem itens') + '</div>' +
        (o.tracking_code
          ? '<div class="admin-row__meta">Rastreio: <strong>' + esc(o.tracking_code) + '</strong></div>'
          : '') +
      '</div>' +
      '<div class="admin-row__actions">' +
        '<button type="button" class="btn btn--secondary btn--sm" data-action="order-detail">Ver detalhes</button>' +
      '</div>' +
    '</div>';
  }

  function renderPager(pagerId, state, onChange) {
    var pager = $('#' + pagerId);
    if (!pager) return;
    var showing = state.rows.length;
    if (!showing && !state.offset) { pager.hidden = true; return; }

    pager.hidden = false;
    var first = state.offset + 1;
    var last = state.offset + showing;
    pager.querySelector('[data-page-info]').textContent =
      showing ? first + '–' + last + ' de ' + state.total : 'Nada nesta página';
    pager.querySelector('[data-page="prev"]').disabled = state.offset === 0;
    pager.querySelector('[data-page="next"]').disabled = last >= state.total;

    if (!pager.dataset.bound) {
      pager.dataset.bound = '1';
      pager.addEventListener('click', function (event) {
        var button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        state.offset = button.getAttribute('data-page') === 'next'
          ? state.offset + state.limit
          : Math.max(0, state.offset - state.limit);
        onChange();
      });
    }
  }

  async function loadOrders() {
    var list = $('#orders-list');
    list.innerHTML = loadingState();

    var result = await D.listOrders(orderFilters());
    if (result.error) { list.innerHTML = errorState(result.error); return; }

    ordersState.rows = (result.data && result.data.orders) || [];
    ordersState.total = (result.data && result.data.total) || 0;

    list.innerHTML = ordersState.rows.length
      ? ordersState.rows.map(orderRow).join('')
      : emptyState('Nenhum pedido encontrado com esses filtros.');
    renderPager('orders-pager', ordersState, loadOrders);
  }

  function resetOrdersAndLoad() { ordersState.offset = 0; loadOrders(); }

  ['#order-status-filter', '#order-date-from', '#order-date-to', '#order-sort'].forEach(function (sel) {
    var el = $(sel);
    if (el) el.addEventListener('change', resetOrdersAndLoad);
  });
  $('#order-search-btn').addEventListener('click', resetOrdersAndLoad);
  $('#order-search').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); resetOrdersAndLoad(); }
  });

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[",\n\r;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  $('#order-export-csv').addEventListener('click', function () {
    if (!ordersState.rows.length) { toast('Não há pedidos na tela para baixar.', 'error'); return; }
    var header = ['Nº', 'Data', 'Cliente', 'E-mail', 'Telefone', 'Situação',
      'Itens', 'Subtotal', 'Frete', 'Desconto', 'Total', 'Rastreio'];
    var rows = ordersState.rows.map(function (o) {
      return [
        o.id,
        formatDateTime(o.created_at),
        o.customer_name || '',
        o.customer_email || '',
        o.customer_phone || '',
        ORDER_STATUS_PT[o.status] || o.status,
        (o.order_items || []).map(function (i) { return i.qty + 'x ' + i.product_name; }).join('; '),
        brl(o.subtotal_cents), brl(o.shipping_cents), brl(o.discount_cents), brl(o.total_cents),
        o.tracking_code || ''
      ];
    });
    var csv = [header].concat(rows).map(function (row) {
      return row.map(csvCell).join(';');
    }).join('\r\n');

    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'pedidos-druza.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Planilha baixada.');
  });

  // ------------------------------------------------------------------
  // Detalhe do pedido
  // ------------------------------------------------------------------
  var orderModal = $('#order-modal');
  var orderModalBody = $('#order-modal-body');
  var currentOrderDetail = null;

  function closeOrderModal() {
    orderModal.hidden = true;
    orderModalBody.innerHTML = '';
    currentOrderDetail = null;
  }
  $$('[data-close-modal]', orderModal).forEach(function (el) {
    el.addEventListener('click', closeOrderModal);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !orderModal.hidden) closeOrderModal();
  });

  function line(label, value) {
    return '<div class="detail-line"><span class="detail-label">' + esc(label) + '</span>' +
      '<span class="detail-value">' + esc(value == null || value === '' ? '—' : value) + '</span></div>';
  }
  function lineHtml(label, html) {
    return '<div class="detail-line"><span class="detail-label">' + esc(label) + '</span>' +
      '<span class="detail-value">' + html + '</span></div>';
  }

  var HISTORY_PT = {
    pedido_criado: 'Pedido criado',
    status_alterado: 'Situação alterada',
    pagamento_atualizado: 'Pagamento atualizado',
    rastreio_adicionado: 'Código de rastreio adicionado',
    rastreio_alterado: 'Código de rastreio corrigido',
    estoque_baixado: 'Estoque baixado',
    estoque_devolvido: 'Estoque devolvido'
  };

  function historyHtml(events) {
    if (!events || !events.length) return '<p class="field__hint">Sem histórico registrado.</p>';
    return '<ol class="timeline">' + events.map(function (event) {
      var detail = '';
      if (event.from_status && event.to_status) {
        detail = (ORDER_STATUS_PT[event.from_status] || event.from_status) + ' → ' +
          (ORDER_STATUS_PT[event.to_status] || event.to_status);
      } else if (event.detail && event.detail.para) {
        detail = String(event.detail.para);
      }
      return '<li class="timeline__item">' +
        '<span class="timeline__when">' + formatDateTime(event.created_at) + '</span>' +
        '<span class="timeline__what">' + esc(HISTORY_PT[event.event_type] || event.event_type) +
        (detail ? ' <span class="muted">· ' + esc(detail) + '</span>' : '') + '</span></li>';
    }).join('') + '</ol>';
  }

  function trackingHtml(order) {
    var code = String(order.tracking_code || '').trim().toUpperCase();
    if (!code) return '<span class="muted">Ainda não informado</span>';
    var url = order.tracking_url || (isCorreiosCode(code)
      ? 'https://rastreamento.correios.com.br/app/index.php?objetos=' + encodeURIComponent(code)
      : null);
    var codeHtml = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(code) + '</a>'
      : '<span>' + esc(code) + '</span>';
    return '<span class="tracking-inline">' + codeHtml +
      '<button type="button" class="link-btn" data-copy-tracking="' + esc(code) + '">Copiar</button></span>';
  }

  var CARRIERS = ['Correios', 'Jadlog', 'Loggi', 'Azul Cargo', 'Total Express',
    'Entrega própria', 'Retirada em mãos', 'Outra'];

  async function openOrderDetail(id) {
    orderModalBody.innerHTML = loadingState();
    orderModal.hidden = false;

    var result = await D.getOrder(id);
    if (result.error || !result.data) {
      orderModalBody.innerHTML = errorState(result.error || 'Não foi possível carregar o pedido.');
      return;
    }

    currentOrderDetail = result.data;
    var o = result.data.order || {};
    var customer = result.data.customer || {};
    var address = result.data.address || null;
    var payment = result.data.payment || null;

    var items = (o.order_items || []).map(function (item) {
      return '<div class="order-item">' +
        (item.image_url
          ? '<img src="' + esc(item.image_url) + '" alt="" class="order-item__thumb">'
          : '<span class="order-item__thumb order-item__thumb--empty"></span>') +
        '<div class="order-item__body">' +
          '<strong>' + esc(item.product_name) + '</strong>' +
          '<span class="muted">' + (item.sku ? esc(item.sku) + ' · ' : '') +
            item.qty + '× ' + esc(brl(item.unit_price_cents)) + '</span>' +
          (item.product_exists
            ? '<span class="muted">Estoque atual: ' + esc(item.current_stock) + '</span>'
            : '<span class="muted">Produto não está mais no catálogo</span>') +
        '</div>' +
        '<strong>' + esc(brl(item.subtotal_cents)) + '</strong>' +
      '</div>';
    }).join('') || '<p class="field__hint">Sem itens.</p>';

    var addressHtml = address
      ? esc(address.recipient) + '<br>' + esc(address.street) + ', ' + esc(address.number) +
        (address.complement ? ' — ' + esc(address.complement) : '') + '<br>' +
        (address.neighborhood ? esc(address.neighborhood) + ' · ' : '') +
        esc(address.city) + '/' + esc(address.state) + ' · CEP ' + esc(address.cep)
      : '<span class="muted">Sem endereço de entrega.</span>';

    var paymentHtml = payment
      ? line('Forma', payment.type_label) +
        (payment.method_id ? line('Bandeira/método', payment.method_id) : '') +
        (payment.installments ? line('Parcelas', payment.installments + '×') : '') +
        line('Aprovado em', payment.approved_at ? formatDateTime(payment.approved_at) : '—') +
        (payment.amount_cents != null ? line('Valor pago', brl(payment.amount_cents)) : '')
      : '<p class="field__hint">Pagamento ainda não confirmado pelo Mercado Pago.</p>';

    var canShip = o.status === 'paid' || o.status === 'shipped';
    var shippingForm =
      '<div class="field-row">' +
        '<label class="field"><span>Transportadora</span><select data-ship="shipping_carrier">' +
          '<option value="">Escolha</option>' +
          CARRIERS.map(function (carrier) {
            return '<option value="' + esc(carrier) + '"' +
              (o.shipping_carrier === carrier ? ' selected' : '') + '>' + esc(carrier) + '</option>';
          }).join('') +
        '</select></label>' +
        '<label class="field"><span>Código de rastreio</span>' +
          '<input type="text" data-ship="tracking_code" maxlength="60" value="' +
            esc(o.tracking_code || '') + '" placeholder="ex.: AA123456789BR"></label>' +
      '</div>' +
      '<div class="field-row">' +
        '<label class="field"><span>Data da postagem</span>' +
          '<input type="date" data-ship="posted_at" value="' +
            esc(o.posted_at ? String(o.posted_at).slice(0, 10) : '') + '"></label>' +
        '<label class="field"><span>Link de rastreamento</span>' +
          '<input type="url" data-ship="tracking_url" maxlength="400" value="' +
            esc(o.tracking_url || '') + '" placeholder="preenchido sozinho para os Correios"></label>' +
      '</div>' +
      (canShip
        ? '<div class="admin-note-actions">' +
            (o.status === 'paid'
              ? '<button type="button" class="btn btn--primary btn--sm" data-action="mark-shipped">Salvar e marcar como enviado</button>'
              : '<button type="button" class="btn btn--primary btn--sm" data-action="mark-delivered">Marcar como entregue</button>') +
            '<button type="button" class="btn btn--secondary btn--sm" data-action="save-shipping">Salvar dados de envio</button>' +
          '</div>'
        : '<div class="admin-note-actions">' +
            '<button type="button" class="btn btn--secondary btn--sm" data-action="save-shipping">Salvar dados de envio</button>' +
            '<span class="field__hint">Este pedido ainda não foi pago.</span>' +
          '</div>');

    orderModalBody.innerHTML =
      '<section class="detail-block"><h3>Pedido</h3>' +
        line('Número', String(o.id)) +
        line('Data', formatDateTime(o.created_at)) +
        lineHtml('Situação', statusBadge(o.status)) +
        lineHtml('Rastreio', trackingHtml(o)) +
      '</section>' +
      '<section class="detail-block"><h3>Cliente</h3>' +
        line('Nome', customer.full_name) +
        line('E-mail', customer.email) +
        line('Telefone', customer.phone) +
      '</section>' +
      '<section class="detail-block"><h3>Entrega</h3>' +
        '<div class="detail-address">' + addressHtml + '</div>' +
        shippingForm +
        (address ? '<div class="admin-note-actions"><button type="button" class="btn btn--ghost btn--sm" data-action="print-label">Imprimir etiqueta e declaração</button></div>' : '') +
      '</section>' +
      '<section class="detail-block"><h3>Pagamento</h3>' + paymentHtml + '</section>' +
      '<section class="detail-block"><h3>Itens</h3>' + items +
        '<div class="detail-totals">' +
          line('Subtotal', brl(o.subtotal_cents)) +
          line('Frete', brl(o.shipping_cents)) +
          (o.discount_cents ? line('Desconto', '− ' + brl(o.discount_cents)) : '') +
          line('Total', brl(o.total_cents)) +
        '</div>' +
      '</section>' +
      '<section class="detail-block"><h3>Histórico</h3>' + historyHtml(result.data.history) + '</section>' +
      '<section class="detail-block"><h3>Anotação interna</h3>' +
        '<label class="field"><span>Só você vê esta anotação</span>' +
          '<textarea id="admin-order-notes" maxlength="2000" rows="4" placeholder="ex.: cliente pediu embalagem de presente">' +
            esc(o.admin_notes || '') + '</textarea></label>' +
        '<div class="admin-note-actions">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="save-note">Salvar anotação</button>' +
        '</div>' +
      '</section>';
  }

  function collectShipping() {
    var payload = {};
    $$('[data-ship]', orderModalBody).forEach(function (field) {
      payload[field.getAttribute('data-ship')] = field.value.trim();
    });
    return payload;
  }

  async function submitOrderUpdate(button, payload, successMessage) {
    setBusy(button, true);
    var result = await D.updateOrder(payload);
    setBusy(button, false);
    if (result.error) { toast(result.error, 'error'); return false; }
    toast(successMessage);
    await Promise.all([loadOrders(), loadShipping(), loadOverview()]);
    return true;
  }

  orderModalBody.addEventListener('click', async function (event) {
    var copyBtn = event.target.closest('button[data-copy-tracking]');
    if (copyBtn) {
      var ok = await copyText(copyBtn.getAttribute('data-copy-tracking') || '');
      toast(ok ? 'Código copiado.' : 'Não foi possível copiar.', ok ? null : 'error');
      return;
    }

    if (event.target.closest('button[data-action="print-label"]')) {
      await printShippingLabels([currentOrderDetail]);
      return;
    }

    var orderId = currentOrderDetail && currentOrderDetail.order && currentOrderDetail.order.id;
    if (!orderId) return;

    var saveShipping = event.target.closest('button[data-action="save-shipping"]');
    if (saveShipping) {
      var payload = collectShipping();
      payload.order_id = orderId;
      if (await submitOrderUpdate(saveShipping, payload, 'Dados de envio salvos.')) {
        openOrderDetail(orderId);
      }
      return;
    }

    var markShipped = event.target.closest('button[data-action="mark-shipped"]');
    if (markShipped) {
      var shippedPayload = collectShipping();
      if (!shippedPayload.tracking_code) {
        if (!(await adminConfirm('Marcar como enviado sem código de rastreio?'))) return;
      }
      shippedPayload.order_id = orderId;
      shippedPayload.status = 'shipped';
      if (await submitOrderUpdate(markShipped, shippedPayload, 'Pedido marcado como enviado.')) {
        openOrderDetail(orderId);
      }
      return;
    }

    var markDelivered = event.target.closest('button[data-action="mark-delivered"]');
    if (markDelivered) {
      if (!(await adminConfirm('Confirmar que este pedido foi entregue?'))) return;
      var deliveredPayload = collectShipping();
      deliveredPayload.order_id = orderId;
      deliveredPayload.status = 'delivered';
      if (await submitOrderUpdate(markDelivered, deliveredPayload, 'Pedido marcado como entregue.')) {
        openOrderDetail(orderId);
      }
      return;
    }

    var saveNote = event.target.closest('button[data-action="save-note"]');
    if (saveNote) {
      var notes = $('#admin-order-notes');
      await submitOrderUpdate(saveNote, {
        order_id: orderId,
        admin_notes: notes ? notes.value : ''
      }, 'Anotação salva.');
    }
  });

  document.addEventListener('click', function (event) {
    var detailBtn = event.target.closest('button[data-action="order-detail"]');
    if (!detailBtn) return;
    var row = detailBtn.closest('.admin-row');
    if (row) openOrderDetail(row.getAttribute('data-id'));
  });

  // ------------------------------------------------------------------
  // Etiquetas de envio (impressão)
  // ------------------------------------------------------------------
  var SENDER_KEY = 'druza_admin_sender_v1';
  var DEFAULT_SENDER = { name: 'Druza Semi Joias', document: '', address: '' };

  function loadSender() {
    try {
      return Object.assign({}, DEFAULT_SENDER, JSON.parse(localStorage.getItem(SENDER_KEY) || '{}'));
    } catch (_) {
      return Object.assign({}, DEFAULT_SENDER);
    }
  }

  async function configureSender(force) {
    var current = loadSender();
    if (!force && current.address) return current;

    var sender = await openSenderModal(current);
    if (!sender) return null;

    localStorage.setItem(SENDER_KEY, JSON.stringify(sender));
    return sender;
  }

  function moneyFromCents(cents) {
    return (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
  }

  function formatAddressHtml(address) {
    var complement = address.complement ? ' - ' + esc(address.complement) : '';
    var neighborhood = address.neighborhood ? esc(address.neighborhood) + '<br>' : '';
    return esc(address.recipient) + '<br>' +
      esc(address.street) + ', ' + esc(address.number) + complement + '<br>' +
      neighborhood + esc(address.city) + ' / ' + esc(address.state) +
      '<div class="cep">CEP ' + esc(address.cep) + '</div>';
  }

  function renderPrintableOrder(detail, sender, index, total) {
    var o = detail.order || {};
    var customer = detail.customer || {};
    var address = detail.address;
    if (!address) return '';

    var rows = (o.order_items || []).map(function (item) {
      var qty = Number(item.qty) || 1;
      var unit = Number(item.unit_price_cents) || 0;
      return '<tr><td class="q">' + esc(String(qty)) + 'x</td><td>' + esc(item.product_name) +
        '</td><td class="money">R$ ' + esc(moneyFromCents(unit)) +
        '</td><td class="money">R$ ' + esc(moneyFromCents(unit * qty)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">Sem itens.</td></tr>';

    return '<section class="print-page">' +
      '<div class="label">' +
        '<p class="tag">Remetente</p>' +
        '<div class="sender"><strong>' + esc(sender.name) + '</strong><br>' +
          (sender.document ? esc(sender.document) + '<br>' : '') + esc(sender.address) + '</div>' +
        '<p class="tag">Destinatario</p>' +
        '<div class="to">' + formatAddressHtml(address) + '</div>' +
        '<p class="meta">Pedido ' + esc(String(o.id || '').slice(0, 8)) +
          (o.tracking_code ? ' - Rastreio ' + esc(o.tracking_code) : '') +
          (total > 1 ? ' - Etiqueta ' + index + ' de ' + total : '') + '</p>' +
      '</div>' +
      '<div class="pick">' +
        '<h2>Lista de separacao</h2>' +
        '<table><thead><tr><th>Qtd.</th><th>Item</th><th>Unit.</th><th>Total</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '<p class="meta">Cliente: ' + esc(customer.full_name || customer.email || '-') +
          ' - Total do pedido: ' + esc(brl(o.total_cents)) + '</p>' +
      '</div>' +
      '<div class="declaration">' +
        '<h2>Declaracao de conteudo</h2>' +
        '<div class="decl-grid">' +
          '<div><strong>Remetente</strong><br>' + esc(sender.name) + '<br>' +
            (sender.document ? esc(sender.document) + '<br>' : '') + esc(sender.address) + '</div>' +
          '<div><strong>Destinatario</strong><br>' + esc(address.recipient) + '<br>' +
            esc(address.street) + ', ' + esc(address.number) +
            (address.complement ? ' - ' + esc(address.complement) : '') + '<br>' +
            esc(address.city) + '/' + esc(address.state) + ' - CEP ' + esc(address.cep) + '</div>' +
        '</div>' +
        '<table><thead><tr><th>Descricao</th><th>Qtd.</th><th>Valor unit.</th><th>Valor total</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '<p class="meta">Valor total declarado: ' + esc(brl(o.total_cents)) + '</p>' +
        '<p class="declaration-text">Declaro que nao me enquadro no conceito de contribuinte previsto na ' +
          'legislacao vigente e que os bens acima descritos sao de minha propriedade, assumindo inteira ' +
          'responsabilidade pelo seu conteudo.</p>' +
        '<div class="signature"><span>Data</span><span>Assinatura do remetente</span></div>' +
      '</div>' +
    '</section>';
  }

  async function printShippingLabels(details) {
    var list = (details || []).filter(function (detail) { return detail && detail.address; });
    if (!list.length) { toast('Nenhum pedido com endereço de entrega para imprimir.', 'error'); return; }

    var sender = await configureSender(false);
    if (!sender) return;

    var win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast('Permita pop-ups para imprimir as etiquetas.', 'error'); return; }

    var pages = list.map(function (detail, index) {
      return renderPrintableOrder(detail, sender, index + 1, list.length);
    }).join('');

    win.document.write(
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiquetas Druza</title><style>' +
      '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}' +
      'body{margin:0;padding:18px;color:#111;background:#f4f4f4}' +
      '.noprint{text-align:center;margin:0 0 18px}.noprint button{font-size:15px;padding:10px 22px;cursor:pointer;margin:0 4px}' +
      '.print-page{width:190mm;min-height:277mm;margin:0 auto 16px;background:#fff;padding:12mm;page-break-after:always}' +
      '.print-page:last-child{page-break-after:auto}' +
      '.label{border:2px solid #111;border-radius:8px;padding:16px;margin-bottom:14px}' +
      '.tag{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#666;margin:0 0 4px}' +
      '.sender{font-size:12px;color:#333;padding-bottom:10px;border-bottom:1px dashed #999;margin-bottom:12px;line-height:1.35}' +
      '.to{font-size:18px;font-weight:bold;line-height:1.35}.cep{font-size:24px;font-weight:bold;letter-spacing:.05em;margin-top:8px}' +
      '.pick,.declaration{margin-top:14px}.pick h2,.declaration h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#555;border-bottom:1px solid #ccc;padding-bottom:5px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;background:#eee}th,td{padding:5px 4px;border:1px solid #ddd;vertical-align:top}' +
      'td.q{width:42px;font-weight:bold;white-space:nowrap}.money{text-align:right;white-space:nowrap}' +
      '.meta{font-size:11px;color:#555;margin:8px 0}.decl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;margin-bottom:8px}' +
      '.declaration-text{font-size:10px;line-height:1.35}.signature{display:grid;grid-template-columns:1fr 2fr;gap:24px;margin-top:24px;font-size:11px}' +
      '.signature span{border-top:1px solid #111;text-align:center;padding-top:5px}' +
      '@media print{body{padding:0;background:#fff}.noprint{display:none}.print-page{margin:0;width:auto;min-height:auto}}' +
      '</style></head><body>' +
      '<div class="noprint"><button onclick="window.print()">Imprimir</button>' +
      '<button onclick="window.close()">Fechar</button></div>' + pages +
      '</body></html>'
    );
    win.document.close();
    win.focus();
  }

  // ------------------------------------------------------------------
  // Envios
  // ------------------------------------------------------------------
  var shippingRows = [];

  async function loadShipping() {
    var list = $('#shipping-list');
    if (!list) return;
    list.innerHTML = loadingState();

    var mode = $('#shipping-filter').value;
    var filters = mode === 'sem_rastreio'
      ? { shipping: 'sem_rastreio', limit: 100 }
      : { status: mode, limit: 100 };

    var result = await D.listOrders(filters);
    if (result.error) { list.innerHTML = errorState(result.error); return; }

    shippingRows = (result.data && result.data.orders) || [];
    list.innerHTML = shippingRows.length
      ? shippingRows.map(function (o) {
        var address = o.shipping_address_snapshot || {};
        return '<div class="admin-row" data-id="' + esc(o.id) + '">' +
          '<div class="admin-row__main">' +
            '<div class="admin-row__title">Pedido ' + esc(String(o.id).slice(0, 8)) + ' ' +
              statusBadge(o.status) + '</div>' +
            '<div class="admin-row__meta">' + esc(o.customer_name || o.customer_email || '—') +
              ' · ' + esc(brl(o.total_cents)) + '</div>' +
            '<div class="admin-row__meta">' +
              esc([address.city, address.state].filter(Boolean).join('/') || 'sem endereço') +
              (o.tracking_code ? ' · Rastreio ' + esc(o.tracking_code) : ' · sem rastreio') +
            '</div>' +
          '</div>' +
          '<div class="admin-row__actions">' +
            '<button type="button" class="btn btn--primary btn--sm" data-action="order-detail">Adicionar rastreio</button>' +
          '</div>' +
        '</div>';
      }).join('')
      : emptyState(mode === 'sem_rastreio'
        ? 'Nenhum pedido esperando postagem. Tudo enviado!'
        : 'Nenhum pedido nesta situação.');
  }

  $('#shipping-filter').addEventListener('change', loadShipping);
  $('#sender-settings-btn').addEventListener('click', async function () {
    if (await configureSender(true)) toast('Remetente salvo para as próximas impressões.');
  });
  $('#print-labels-btn').addEventListener('click', async function () {
    var button = this;
    if (!shippingRows.length) { toast('Não há pedidos na lista para imprimir.', 'error'); return; }

    setBusy(button, true, 'Preparando…');
    var details = [];
    for (var i = 0; i < shippingRows.length; i++) {
      var result = await D.getOrder(shippingRows[i].id);
      if (result.data) details.push(result.data);
    }
    setBusy(button, false);
    await printShippingLabels(details);
  });

  // ------------------------------------------------------------------
  // Produtos
  // ------------------------------------------------------------------
  var productsState = { offset: 0, limit: 24, total: 0, rows: [] };
  var categoriesCache = [];

  function productFilters() {
    return {
      search: $('#product-search').value.trim() || undefined,
      category_id: $('#product-category-filter').value || undefined,
      status: $('#product-status-filter').value || undefined,
      availability: $('#product-availability-filter').value || undefined,
      sort: $('#product-sort').value,
      limit: productsState.limit,
      offset: productsState.offset
    };
  }

  function productRow(p) {
    var image = p.primary_image;
    var stock = p.stock || {};
    var stockClass = stock.available === 0 ? 'is-danger' : (stock.low_stock ? 'is-warn' : '');

    return '<div class="admin-row product-row" data-id="' + esc(p.id) + '">' +
      (image
        ? '<img class="product-row__thumb" src="' + esc(image.url) + '" alt="">'
        : '<span class="product-row__thumb product-row__thumb--empty">sem foto</span>') +
      '<div class="admin-row__main">' +
        '<div class="admin-row__title">' + esc(p.name) + ' ' +
          statusBadge(p.status, PRODUCT_STATUS_PT) +
          (p.featured ? ' <span class="badge-status" data-status="shipped">Destaque</span>' : '') +
        '</div>' +
        '<div class="admin-row__meta">' +
          esc(p.sku || 'sem código') + ' · ' +
          esc((p.categories && p.categories.name) || 'sem categoria') + ' · ' +
          esc(brl(p.price_cents)) +
          (p.promo_price_cents != null ? ' · promo ' + esc(brl(p.promo_price_cents)) : '') +
        '</div>' +
        '<div class="admin-row__meta">' +
          '<span class="' + stockClass + '">Disponível: ' + esc(stock.available) + '</span>' +
          (stock.reserved ? ' · reservado para pedidos: ' + esc(stock.reserved) : '') +
          ' · mínimo: ' + esc(p.min_stock) +
        '</div>' +
      '</div>' +
      '<div class="admin-row__actions">' +
        '<button type="button" class="btn btn--secondary btn--sm" data-action="edit-product">Editar</button>' +
        '<button type="button" class="link-btn" data-action="duplicate-product">Duplicar</button>' +
        (p.status === 'active'
          ? '<button type="button" class="link-btn link-btn--danger" data-action="deactivate-product">Tirar da loja</button>'
          : '<button type="button" class="link-btn" data-action="activate-product">Colocar à venda</button>') +
        (p.status === 'archived'
          ? ''
          : '<button type="button" class="link-btn link-btn--danger" data-action="archive-product">Arquivar</button>') +
      '</div>' +
    '</div>';
  }

  async function loadProducts() {
    var list = $('#products-list');
    list.innerHTML = loadingState();

    var result = await D.listProducts(productFilters());
    if (result.error) { list.innerHTML = errorState(result.error); return; }

    productsState.rows = (result.data && result.data.products) || [];
    productsState.total = (result.data && result.data.total) || 0;

    list.innerHTML = productsState.rows.length
      ? productsState.rows.map(productRow).join('')
      : emptyState(
        'Nenhum produto encontrado.',
        '<button type="button" class="btn btn--primary" data-goto="products" data-action="new-product">Cadastrar o primeiro produto</button>'
      );
    renderPager('products-pager', productsState, loadProducts);
  }

  function resetProductsAndLoad() { productsState.offset = 0; loadProducts(); }

  ['#product-category-filter', '#product-status-filter', '#product-availability-filter', '#product-sort']
    .forEach(function (sel) { $(sel).addEventListener('change', resetProductsAndLoad); });

  var productSearchTimer = null;
  $('#product-search').addEventListener('input', function () {
    if (productSearchTimer) clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(resetProductsAndLoad, 350);
  });

  // ---- Formulário de produto ----
  var productForm = $('#product-form');
  var productBrowser = $('#products-browser');
  var productFeedback = $('#product-feedback');
  var productImages = [];

  var ATTRIBUTE_TEXT_FIELDS = ['tipo_peca', 'material', 'banho', 'cor', 'pedra', 'dimensoes',
    'comprimento', 'peso', 'tamanho', 'acabamento', 'conservacao', 'garantia', 'observacoes'];
  var ATTRIBUTE_BOOL_FIELDS = ['ajustavel', 'hipoalergenico', 'sem_niquel'];

  function renderProductImages() {
    var wrap = $('#product-images');
    if (!productImages.length) {
      wrap.innerHTML = '<p class="field__hint">Nenhuma foto ainda. A peça aparece na loja com um selo “Foto em breve”.</p>';
      return;
    }
    wrap.innerHTML = productImages.map(function (image, index) {
      return '<figure class="image-card' + (image.is_primary ? ' is-primary' : '') + '">' +
        '<img src="' + esc(image.url) + '" alt="">' +
        (image.is_primary ? '<span class="image-card__flag">Principal</span>' : '') +
        '<input type="text" class="image-card__alt" data-image-alt="' + index +
          '" maxlength="160" placeholder="Descreva a foto" value="' + esc(image.alt || '') + '">' +
        '<figcaption class="image-card__actions">' +
          (image.is_primary ? '' : '<button type="button" class="link-btn" data-image-primary="' + index + '">Tornar principal</button>') +
          (index > 0 ? '<button type="button" class="link-btn" data-image-up="' + index + '">←</button>' : '') +
          (index < productImages.length - 1 ? '<button type="button" class="link-btn" data-image-down="' + index + '">→</button>' : '') +
          '<button type="button" class="link-btn link-btn--danger" data-image-remove="' + index + '">Remover</button>' +
        '</figcaption>' +
      '</figure>';
    }).join('');
  }

  $('#product-images').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-image-primary], button[data-image-remove], button[data-image-up], button[data-image-down]');
    if (!button) return;

    var primary = button.getAttribute('data-image-primary');
    var remove = button.getAttribute('data-image-remove');
    var up = button.getAttribute('data-image-up');
    var down = button.getAttribute('data-image-down');

    if (primary != null) {
      productImages.forEach(function (image, index) { image.is_primary = index === Number(primary); });
    } else if (remove != null) {
      var wasPrimary = productImages[Number(remove)].is_primary;
      productImages.splice(Number(remove), 1);
      if (wasPrimary && productImages.length) productImages[0].is_primary = true;
    } else if (up != null) {
      var i = Number(up);
      var swapped = productImages[i - 1];
      productImages[i - 1] = productImages[i];
      productImages[i] = swapped;
    } else if (down != null) {
      var j = Number(down);
      var other = productImages[j + 1];
      productImages[j + 1] = productImages[j];
      productImages[j] = other;
    }
    renderProductImages();
  });

  $('#product-images').addEventListener('input', function (event) {
    var index = event.target.getAttribute && event.target.getAttribute('data-image-alt');
    if (index != null) productImages[Number(index)].alt = event.target.value;
  });

  $('#product-image-input').addEventListener('change', async function () {
    var files = Array.prototype.slice.call(this.files || []);
    if (!files.length) return;

    var status = $('#product-image-status');
    var slug = productForm.elements.slug.value.trim() ||
      productForm.elements.name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    for (var i = 0; i < files.length; i++) {
      if (productImages.length >= 12) {
        toast('Máximo de 12 fotos por produto.', 'error');
        break;
      }
      status.textContent = 'Enviando foto ' + (i + 1) + ' de ' + files.length + '…';
      var uploaded = await D.uploadProductImage(files[i], slug);
      if (uploaded.error) { status.textContent = ''; toast(uploaded.error, 'error'); break; }
      productImages.push({
        url: uploaded.url,
        alt: '',
        is_primary: productImages.length === 0
      });
      renderProductImages();
    }
    status.textContent = '';
    this.value = '';
  });

  function updateMargin() {
    var price = reaisToCents(productForm.elements.price.value);
    var cost = reaisToCents(productForm.elements.cost.value);
    var output = $('#product-margin');
    if (!Number.isFinite(price) || price == null || !Number.isFinite(cost) || cost == null || price <= 0) {
      output.textContent = '—';
      return;
    }
    var profit = price - cost;
    var percent = Math.round((profit / price) * 100);
    output.textContent = brl(profit) + ' por peça (' + percent + '%)';
  }
  productForm.elements.price.addEventListener('input', updateMargin);
  productForm.elements.cost.addEventListener('input', updateMargin);

  function fillProductForm(p) {
    var f = productForm.elements;
    // Um produto duplicado chega preenchido mas sem id: para todos os
    // efeitos do formulário ele é um cadastro novo.
    var isExisting = !!(p && p.id);
    f.id.value = isExisting ? p.id : '';
    f.name.value = p ? p.name : '';
    f.slug.value = p ? p.slug : '';
    f.sku.value = p ? (p.sku || '') : '';
    f.status.value = p ? p.status : 'active';
    f.category_id.value = p ? (p.category_id || '') : '';
    f.collection.value = p ? (p.collection || '') : '';
    f.tags.value = p && p.tags ? p.tags.join(', ') : '';
    f.short_description.value = p ? (p.short_description || '') : '';
    f.long_description.value = p ? (p.long_description || '') : '';
    f.price.value = p ? centsToReais(p.price_cents) : '';
    f.promo_price.value = p ? centsToReais(p.promo_price_cents) : '';
    f.compare_at_price.value = p ? centsToReais(p.compare_at_price_cents) : '';
    f.cost.value = p ? centsToReais(p.cost_cents) : '';
    f.promo_starts_at.value = p ? isoToLocalInput(p.promo_starts_at) : '';
    f.promo_ends_at.value = p ? isoToLocalInput(p.promo_ends_at) : '';
    f.min_stock.value = p ? Number(p.min_stock || 0) : 0;
    f.initial_stock.value = 0;
    f.featured.checked = p ? !!p.featured : false;
    f.seo_title.value = p ? (p.seo_title || '') : '';
    f.seo_description.value = p ? (p.seo_description || '') : '';

    var attributes = (p && p.attributes) || {};
    ATTRIBUTE_TEXT_FIELDS.forEach(function (key) {
      if (f['attr_' + key]) f['attr_' + key].value = attributes[key] || '';
    });
    ATTRIBUTE_BOOL_FIELDS.forEach(function (key) {
      if (f['attr_' + key]) f['attr_' + key].checked = attributes[key] === true;
    });

    productImages = p && p.product_images
      ? p.product_images.slice()
        .sort(function (a, b) { return Number(a.position) - Number(b.position); })
        .map(function (image) {
          return { url: image.url, alt: image.alt || '', is_primary: !!image.is_primary };
        })
      : [];
    renderProductImages();
    updateMargin();

    // Estoque de produto existente só muda pela seção Estoque, para toda
    // alteração de saldo ficar no histórico.
    $('#initial-stock-row').querySelector('[name="initial_stock"]').closest('.field').hidden = isExisting;
    $('#stock-edit-note').hidden = !isExisting;
  }

  function openProductForm(p) {
    var isExisting = !!(p && p.id);
    productFeedback.className = 'auth-feedback';
    productFeedback.textContent = '';
    fillProductForm(p);
    $('#product-form-title').textContent = isExisting ? 'Editar produto' : 'Cadastrar produto';
    $('#product-form-eyebrow').textContent = isExisting ? p.name : 'Novo produto';
    productBrowser.hidden = true;
    productForm.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeProductForm() {
    productForm.hidden = true;
    productBrowser.hidden = false;
    productForm.reset();
    productImages = [];
  }

  $('#product-add-btn').addEventListener('click', function () { openProductForm(null); });
  $('#product-cancel-btn').addEventListener('click', async function () {
    if (await adminConfirm('Descartar as alterações deste produto?')) closeProductForm();
  });
  $('#product-back-btn').addEventListener('click', async function () {
    if (await adminConfirm('Voltar para a lista? As alterações não salvas serão perdidas.')) closeProductForm();
  });

  $('#products-list').addEventListener('click', async function (event) {
    var row = event.target.closest('.admin-row');
    if (!row) return;
    var product = productsState.rows.find(function (p) { return p.id === row.getAttribute('data-id'); });
    if (!product) return;

    if (event.target.closest('button[data-action="edit-product"]')) {
      openProductForm(product);
      return;
    }

    if (event.target.closest('button[data-action="duplicate-product"]')) {
      // Cópia sem id, slug nem SKU: ao salvar vira um produto novo, e
      // entra como "fora da loja" para a usuária conferir antes.
      openProductForm(Object.assign({}, product, {
        id: null,
        slug: '',
        sku: '',
        name: product.name + ' (cópia)',
        status: 'inactive'
      }));
      toast('Ajuste os dados e salve para criar a cópia.');
      return;
    }

    var statusButton = event.target.closest('button[data-action="deactivate-product"], button[data-action="activate-product"], button[data-action="archive-product"]');
    if (!statusButton) return;

    var action = statusButton.getAttribute('data-action');
    var target = action === 'activate-product' ? 'active'
      : (action === 'archive-product' ? 'archived' : 'inactive');

    var question = {
      active: 'Colocar "' + product.name + '" à venda na loja?',
      inactive: 'Tirar "' + product.name + '" da loja? O estoque continua guardado e a peça volta quando você quiser.',
      archived: 'Arquivar "' + product.name + '"? Ele sai da loja e da lista, mas o histórico de pedidos é preservado.'
    }[target];
    if (!(await adminConfirm(question))) return;

    setBusy(statusButton, true, 'Aguarde…');
    var result = await D.setProductStatus(product.id, target);
    setBusy(statusButton, false);
    if (result.error) { toast(result.error, 'error'); return; }

    toast({
      active: 'Produto colocado à venda.',
      inactive: 'Produto retirado da loja.',
      archived: 'Produto arquivado.'
    }[target]);
    await Promise.all([loadProducts(), loadOverview()]);
  });

  function collectProductPayload() {
    var f = productForm.elements;
    var attributes = {};
    ATTRIBUTE_TEXT_FIELDS.forEach(function (key) {
      var value = f['attr_' + key] ? f['attr_' + key].value.trim() : '';
      if (value) attributes[key] = value;
    });
    ATTRIBUTE_BOOL_FIELDS.forEach(function (key) {
      if (f['attr_' + key] && f['attr_' + key].checked) attributes[key] = true;
    });

    var payload = {
      id: f.id.value || undefined,
      name: f.name.value.trim(),
      slug: f.slug.value.trim() || undefined,
      sku: f.sku.value.trim() || undefined,
      status: f.status.value,
      category_id: f.category_id.value || null,
      collection: f.collection.value.trim() || undefined,
      tags: f.tags.value,
      short_description: f.short_description.value.trim() || undefined,
      long_description: f.long_description.value.trim() || undefined,
      price_cents: reaisToCents(f.price.value),
      promo_price_cents: reaisToCents(f.promo_price.value),
      compare_at_price_cents: reaisToCents(f.compare_at_price.value),
      cost_cents: reaisToCents(f.cost.value),
      promo_starts_at: localInputToIso(f.promo_starts_at.value),
      promo_ends_at: localInputToIso(f.promo_ends_at.value),
      min_stock: Number(f.min_stock.value || 0),
      featured: f.featured.checked,
      attributes: attributes,
      seo_title: f.seo_title.value.trim() || undefined,
      seo_description: f.seo_description.value.trim() || undefined,
      images: productImages.map(function (image, index) {
        return { url: image.url, alt: image.alt || null, position: index, is_primary: !!image.is_primary };
      })
    };
    if (!payload.id) payload.initial_stock = Number(f.initial_stock.value || 0);
    return payload;
  }

  productForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    productFeedback.className = 'auth-feedback';
    productFeedback.textContent = '';

    var payload = collectProductPayload();
    if (!payload.name || payload.name.length < 2) {
      productFeedback.className = 'auth-feedback is-error';
      productFeedback.textContent = 'Informe o nome da peça.';
      productForm.elements.name.focus();
      return;
    }
    if (!Number.isFinite(payload.price_cents) || payload.price_cents == null || payload.price_cents < 0) {
      productFeedback.className = 'auth-feedback is-error';
      productFeedback.textContent = 'Informe um preço de venda válido, por exemplo 189,00.';
      productForm.elements.price.focus();
      return;
    }

    var saveButton = $('#product-save-btn');
    setBusy(saveButton, true);
    var result = await D.upsertProduct(payload);
    setBusy(saveButton, false);

    if (result.error) {
      productFeedback.className = 'auth-feedback is-error';
      productFeedback.textContent = result.error;
      return;
    }

    toast(result.data && result.data.created ? 'Produto cadastrado com sucesso.' : 'Alterações salvas.');
    closeProductForm();
    await Promise.all([loadProducts(), loadOverview(), refreshProductSelects()]);
  });

  // ------------------------------------------------------------------
  // Categorias
  // ------------------------------------------------------------------
  var categoryForm = $('#category-form');
  var categoryFeedback = $('#category-feedback');

  function fillCategorySelects() {
    var options = '<option value="">Sem categoria</option>' + categoriesCache.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join('');

    var productSelect = productForm.elements.category_id;
    var currentProductValue = productSelect.value;
    productSelect.innerHTML = options;
    productSelect.value = currentProductValue;

    var filter = $('#product-category-filter');
    var currentFilter = filter.value;
    filter.innerHTML = '<option value="">Todas</option>' + categoriesCache.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join('');
    filter.value = currentFilter;

    var parentSelect = categoryForm.elements.parent_id;
    var currentParent = parentSelect.value;
    parentSelect.innerHTML = '<option value="">Nenhuma</option>' + categoriesCache
      .filter(function (c) { return !c.parent_id; })
      .map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('');
    parentSelect.value = currentParent;
  }

  async function loadCategories() {
    var list = $('#categories-list');
    list.innerHTML = loadingState();

    var result = await D.listCategories();
    if (result.error) { list.innerHTML = errorState(result.error); return; }

    categoriesCache = (result.data && result.data.categories) || [];
    fillCategorySelects();

    list.innerHTML = categoriesCache.length
      ? categoriesCache.map(function (c) {
        var parent = categoriesCache.find(function (x) { return x.id === c.parent_id; });
        return '<div class="admin-row" data-id="' + esc(c.id) + '">' +
          '<div class="admin-row__main">' +
            '<div class="admin-row__title">' + esc(c.name) +
              (c.active ? '' : ' <span class="badge-status" data-status="canceled">Inativa</span>') + '</div>' +
            '<div class="admin-row__meta">' + esc(c.slug) +
              (parent ? ' · dentro de ' + esc(parent.name) : '') +
              ' · ' + c.products_count + ' produto' + (c.products_count === 1 ? '' : 's') + '</div>' +
          '</div>' +
          '<div class="admin-row__actions">' +
            '<button type="button" class="link-btn" data-action="edit-category">Editar</button>' +
            '<button type="button" class="link-btn link-btn--danger" data-action="delete-category">Excluir</button>' +
          '</div>' +
        '</div>';
      }).join('')
      : emptyState('Nenhuma categoria cadastrada.');
  }

  function resetCategoryForm() {
    categoryForm.reset();
    categoryForm.elements.id.value = '';
    categoryForm.elements.active.checked = true;
    $('#category-form-title').textContent = 'Nova categoria';
    $('#category-save-btn').textContent = 'Criar categoria';
    $('#category-cancel-btn').hidden = true;
    categoryFeedback.textContent = '';
  }

  $('#category-cancel-btn').addEventListener('click', resetCategoryForm);

  $('#categories-list').addEventListener('click', async function (event) {
    var row = event.target.closest('.admin-row');
    if (!row) return;
    var category = categoriesCache.find(function (c) { return c.id === row.getAttribute('data-id'); });
    if (!category) return;

    if (event.target.closest('button[data-action="edit-category"]')) {
      var f = categoryForm.elements;
      f.id.value = category.id;
      f.name.value = category.name;
      f.slug.value = category.slug;
      f.description.value = category.description || '';
      f.parent_id.value = category.parent_id || '';
      f.sort_order.value = category.sort_order || 0;
      f.active.checked = !!category.active;
      $('#category-form-title').textContent = 'Editar categoria';
      $('#category-save-btn').textContent = 'Salvar alterações';
      $('#category-cancel-btn').hidden = false;
      categoryForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    if (!event.target.closest('button[data-action="delete-category"]')) return;

    var moveTo = null;
    if (category.products_count > 0) {
      var others = categoriesCache.filter(function (c) { return c.id !== category.id; });
      if (!others.length) {
        toast('Esta categoria tem produtos e não há outra categoria para movê-los. Desative-a em vez de excluir.', 'error');
        return;
      }
      moveTo = await pickCategoryToMove(category, others);
      if (!moveTo) return;
    } else if (!(await adminConfirm('Excluir a categoria "' + category.name + '"?'))) {
      return;
    }

    var result = await D.deleteCategory(category.id, moveTo);
    if (result.error) { toast(result.error, 'error'); return; }
    toast('Categoria excluída.');
    await Promise.all([loadCategories(), loadProducts()]);
  });

  categoryForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    categoryFeedback.className = 'auth-feedback';
    categoryFeedback.textContent = '';

    var f = categoryForm.elements;
    if (!f.name.value.trim()) {
      categoryFeedback.className = 'auth-feedback is-error';
      categoryFeedback.textContent = 'Informe o nome da categoria.';
      return;
    }

    var button = $('#category-save-btn');
    setBusy(button, true);
    var result = await D.upsertCategory({
      id: f.id.value || undefined,
      name: f.name.value.trim(),
      slug: f.slug.value.trim() || undefined,
      description: f.description.value.trim() || undefined,
      parent_id: f.parent_id.value || null,
      sort_order: Number(f.sort_order.value || 0),
      active: f.active.checked
    });
    setBusy(button, false);

    if (result.error) {
      categoryFeedback.className = 'auth-feedback is-error';
      categoryFeedback.textContent = result.error;
      return;
    }

    toast(f.id.value ? 'Categoria atualizada.' : 'Categoria criada.');
    resetCategoryForm();
    await loadCategories();
  });

  // ------------------------------------------------------------------
  // Estoque
  // ------------------------------------------------------------------
  var inventoryState = { offset: 0, limit: 30, total: 0, rows: [] };
  var stockProducts = [];

  async function refreshProductSelects() {
    var result = await D.listProducts({ limit: 200, sort: 'nome' });
    if (result.error) return;
    stockProducts = (result.data && result.data.products) || [];

    var filterSelect = $('#inventory-filter-product');
    var currentFilter = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todos</option>' + stockProducts.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
    filterSelect.value = currentFilter;
  }

  function renderMovementTypeFilter() {
    var select = $('#inventory-filter-type');
    select.innerHTML = '<option value="">Todos</option>' + Object.keys(MOVEMENT_PT).map(function (key) {
      return '<option value="' + key + '">' + esc(MOVEMENT_PT[key]) + '</option>';
    }).join('');
  }

  var inventoryForm = $('#inventory-form');

  // ---- Campo "Produto": busca digitável entre os já cadastrados ----
  // O <select> nativo obrigava rolar uma lista enorme para achar a peça.
  // Aqui a usuária digita, filtra na hora e escolhe — mas só entre
  // produtos que já existem: criar peça nova continua sendo tarefa da
  // aba Produtos, para nenhum cadastro incompleto (sem preço) escapar por
  // um atalho do Estoque.
  var comboInput = $('#inventory-product-input');
  var comboHidden = inventoryForm.elements.product_id;
  var comboList = $('#inventory-product-listbox');
  var comboMatches = [];
  var comboActiveIndex = -1;

  function comboClose() {
    comboList.hidden = true;
    comboList.innerHTML = '';
    comboMatches = [];
    comboActiveIndex = -1;
    comboInput.setAttribute('aria-expanded', 'false');
    comboInput.removeAttribute('aria-activedescendant');
  }

  function comboHighlight(index) {
    comboActiveIndex = index;
    Array.prototype.forEach.call(comboList.children, function (li, i) {
      li.classList.toggle('is-active', i === index);
      li.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    if (index >= 0) comboInput.setAttribute('aria-activedescendant', 'combo-opt-' + index);
  }

  function comboRender(term) {
    comboMatches = stockProducts.filter(function (p) {
      return p.name.toLowerCase().indexOf(term) !== -1;
    }).slice(0, 8);

    if (!comboMatches.length) {
      comboList.innerHTML = '<li class="combo__empty">Nenhum produto encontrado com esse nome.</li>';
      comboList.hidden = false;
      comboInput.setAttribute('aria-expanded', 'true');
      comboInput.removeAttribute('aria-activedescendant');
      return;
    }

    comboList.innerHTML = comboMatches.map(function (p, i) {
      return '<li role="option" id="combo-opt-' + i + '" data-index="' + i + '" class="combo__option">' +
        '<span class="combo__option-name">' + esc(p.name) + '</span>' +
        '<span class="combo__option-stock">' + esc(p.stock_quantity) + ' em estoque</span></li>';
    }).join('');
    comboList.hidden = false;
    comboInput.setAttribute('aria-expanded', 'true');
    comboHighlight(0);
  }

  // Único ponto que efetivamente escolhe um produto — usado tanto pelo
  // clique/Enter na lista quanto pelo atalho "Repor" do estoque baixo.
  function comboChoose(product) {
    comboHidden.value = product ? product.id : '';
    comboInput.value = product ? product.name : '';
    comboClose();
    updateInventoryFormHints();
  }

  comboInput.addEventListener('input', function () {
    var term = comboInput.value.trim().toLowerCase();
    comboHidden.value = ''; // digitar invalida a seleção anterior
    updateInventoryFormHints();
    if (!term) { comboClose(); return; }
    comboRender(term);
  });

  comboInput.addEventListener('keydown', function (event) {
    if (comboList.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      comboHighlight(Math.min(comboActiveIndex + 1, comboMatches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      comboHighlight(Math.max(comboActiveIndex - 1, 0));
    } else if (event.key === 'Enter') {
      if (comboActiveIndex > -1 && comboMatches[comboActiveIndex]) {
        event.preventDefault();
        comboChoose(comboMatches[comboActiveIndex]);
      }
    } else if (event.key === 'Escape') {
      comboClose();
    }
  });

  // mousedown (não click) evita que o campo perca o foco antes do clique
  // na opção terminar de registrar — sem isso, a lista fecharia sozinha
  // (blur) um instante antes da escolha valer.
  comboList.addEventListener('mousedown', function (event) {
    var option = event.target.closest('.combo__option');
    if (!option) return;
    event.preventDefault();
    comboChoose(comboMatches[Number(option.getAttribute('data-index'))]);
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-combo]')) comboClose();
  });

  function updateInventoryFormHints() {
    var type = inventoryForm.elements.movement_type.value;
    var isEntry = type === 'entrada';
    var isCount = type === 'inventario';
    var needsReason = ['ajuste_negativo', 'perda', 'avaria'].indexOf(type) !== -1;

    $('#inventory-entry-fields').hidden = !isEntry;
    $('#inventory-qty-label').textContent = isCount
      ? 'Quantidade contada na prateleira *'
      : 'Quantidade *';
    inventoryForm.elements.reason.required = needsReason;
    $('#inventory-reason-field').querySelector('span').textContent = needsReason ? 'Motivo *' : 'Motivo';

    var selected = stockProducts.find(function (p) {
      return p.id === inventoryForm.elements.product_id.value;
    });
    $('#inventory-current').textContent = selected
      ? 'Hoje há ' + selected.stock_quantity + ' unidade(s) disponível(is) de ' + selected.name + '.'
      : '';
  }

  inventoryForm.elements.movement_type.addEventListener('change', updateInventoryFormHints);

  inventoryForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var feedback = $('#inventory-feedback');
    feedback.className = 'auth-feedback';
    feedback.textContent = '';

    var f = inventoryForm.elements;
    if (!f.product_id.value) {
      feedback.className = 'auth-feedback is-error';
      feedback.textContent = 'Escolha o produto.';
      return;
    }

    var quantity = Number(f.quantity.value);
    if (!Number.isInteger(quantity) || quantity < 0) {
      feedback.className = 'auth-feedback is-error';
      feedback.textContent = 'Informe uma quantidade válida.';
      return;
    }

    var type = f.movement_type.value;
    var product = stockProducts.find(function (p) { return p.id === f.product_id.value; });
    var confirmation = {
      entrada: 'Registrar entrada de ' + quantity + ' unidade(s) de "' + (product && product.name) + '"?',
      inventario: 'Corrigir o estoque de "' + (product && product.name) + '" para ' + quantity + ' unidade(s)?'
    }[type] || 'Registrar saída de ' + quantity + ' unidade(s) de "' + (product && product.name) + '"?';
    if (!(await adminConfirm(confirmation))) return;

    var button = $('#inventory-save-btn');
    setBusy(button, true, 'Registrando…');
    var result = await D.moveInventory({
      product_id: f.product_id.value,
      movement_type: type,
      quantity: quantity,
      reason: f.reason.value.trim() || undefined,
      note: f.note.value.trim() || undefined,
      unit_cost_cents: type === 'entrada' ? reaisToCents(f.unit_cost.value) : undefined,
      supplier: type === 'entrada' ? (f.supplier.value.trim() || undefined) : undefined,
      // Chave por envio: se a rede engasgar e a usuária clicar de novo, o
      // servidor devolve o mesmo resultado em vez de contar duas vezes.
      idempotency_key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
    });
    setBusy(button, false);

    if (result.error) {
      feedback.className = 'auth-feedback is-error';
      feedback.textContent = result.error;
      return;
    }

    var saved = result.data && result.data.product;
    toast(saved
      ? 'Movimentação registrada. "' + saved.name + '" agora tem ' + saved.stock_quantity + ' em estoque.'
      : 'Movimentação registrada.');

    inventoryForm.reset();
    comboClose();
    updateInventoryFormHints();
    await Promise.all([refreshProductSelects(), loadInventoryHistory(), loadLowStock(), loadOverview()]);
  });

  async function loadLowStock() {
    var wrap = $('#inventory-low');
    var result = await D.listProducts({ availability: 'low_stock', status: 'active', limit: 50, sort: 'estoque_menor' });
    if (result.error) { wrap.innerHTML = errorState(result.error); return; }

    var rows = (result.data && result.data.products) || [];
    wrap.innerHTML = rows.length
      ? rows.map(function (p) {
        return '<div class="mini-row"><span>' + esc(p.name) + '</span>' +
          '<span><strong class="' + (p.stock_quantity > 0 ? 'is-warn' : 'is-danger') + '">' +
          esc(p.stock_quantity) + '</strong> / mín. ' + esc(p.min_stock) +
          ' <button type="button" class="link-btn" data-restock="' + esc(p.id) + '">Repor</button></span></div>';
      }).join('')
      : emptyState('Nenhum produto abaixo do estoque mínimo.');
  }

  $('#inventory-low').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-restock]');
    if (!button) return;
    var product = stockProducts.find(function (p) { return p.id === button.getAttribute('data-restock'); });
    comboChoose(product || null);
    inventoryForm.elements.movement_type.value = 'entrada';
    updateInventoryFormHints();
    inventoryForm.elements.quantity.focus();
    inventoryForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  async function loadInventoryHistory() {
    var wrap = $('#inventory-history');
    wrap.innerHTML = loadingState();

    var result = await D.listInventory({
      product_id: $('#inventory-filter-product').value || undefined,
      movement_type: $('#inventory-filter-type').value || undefined,
      date_from: $('#inventory-date-from').value || undefined,
      date_to: $('#inventory-date-to').value || undefined,
      limit: inventoryState.limit,
      offset: inventoryState.offset
    });
    if (result.error) { wrap.innerHTML = errorState(result.error); return; }

    inventoryState.rows = (result.data && result.data.movements) || [];
    inventoryState.total = (result.data && result.data.total) || 0;

    wrap.innerHTML = inventoryState.rows.length
      ? '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
        '<th>Quando</th><th>Produto</th><th>O que aconteceu</th>' +
        '<th class="num">Mudança</th><th class="num">Saldo</th><th>Motivo</th><th>Quem</th>' +
        '</tr></thead><tbody>' +
        inventoryState.rows.map(function (mv) {
          var sign = mv.quantity_change > 0 ? '+' : '';
          return '<tr>' +
            '<td>' + formatDateTime(mv.created_at) + '</td>' +
            '<td>' + esc((mv.products && mv.products.name) || mv.product_slug) + '</td>' +
            '<td>' + esc(MOVEMENT_PT[mv.movement_type] || mv.movement_type) + '</td>' +
            '<td class="num ' + (mv.quantity_change < 0 ? 'is-danger' : '') + '">' +
              sign + mv.quantity_change + '</td>' +
            '<td class="num">' + mv.quantity_before + ' → ' + mv.quantity_after + '</td>' +
            '<td>' + esc(mv.reason || mv.note || '—') + '</td>' +
            '<td>' + esc(mv.admin_email || 'sistema') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>'
      : emptyState('Nenhuma movimentação neste período.');

    renderPager('inventory-pager', inventoryState, loadInventoryHistory);
  }

  ['#inventory-filter-product', '#inventory-filter-type', '#inventory-date-from', '#inventory-date-to']
    .forEach(function (sel) {
      $(sel).addEventListener('change', function () {
        inventoryState.offset = 0;
        loadInventoryHistory();
      });
    });

  async function loadInventorySection() {
    renderMovementTypeFilter();
    await refreshProductSelects();
    updateInventoryFormHints();
    await Promise.all([loadLowStock(), loadInventoryHistory()]);
  }

  // ------------------------------------------------------------------
  // Clientes
  // ------------------------------------------------------------------
  async function loadCustomers() {
    var list = $('#customers-list');
    list.innerHTML = loadingState();

    var result = await D.listCustomers({ search: $('#customer-search').value.trim() || undefined });
    if (result.error) { list.innerHTML = errorState(result.error); return; }

    var customers = (result.data && result.data.customers) || [];
    list.innerHTML = customers.length
      ? '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
        '<th>Cliente</th><th>Contato</th><th class="num">Pedidos</th>' +
        '<th class="num">Total comprado</th><th>Último pedido</th><th></th>' +
        '</tr></thead><tbody>' +
        customers.map(function (c) {
          return '<tr>' +
            '<td>' + esc(c.full_name || 'sem nome') + '</td>' +
            '<td>' + esc(c.email || '—') + '<br><span class="muted">' + esc(c.phone || '') + '</span></td>' +
            '<td class="num">' + c.orders_count + (c.paid_count ? ' <span class="muted">(' + c.paid_count + ' pagos)</span>' : '') + '</td>' +
            '<td class="num">' + esc(brl(c.total_cents)) + '</td>' +
            '<td>' + formatDate(c.last_order_at) + '</td>' +
            '<td><button type="button" class="link-btn" data-customer-orders="' +
              esc(c.email || c.full_name || '') + '">Ver pedidos</button></td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>'
      : emptyState('Nenhum cliente encontrado.');
  }

  $('#customer-search-btn').addEventListener('click', loadCustomers);
  $('#customer-search').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); loadCustomers(); }
  });

  $('#customers-list').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-customer-orders]');
    if (!button) return;
    $('#order-search').value = button.getAttribute('data-customer-orders');
    $('#order-status-filter').value = '';
    showSection('orders');
    resetOrdersAndLoad();
  });

  // ------------------------------------------------------------------
  // Histórico administrativo
  // ------------------------------------------------------------------
  var auditState = { offset: 0, limit: 40, total: 0, rows: [] };

  async function loadAudit() {
    var list = $('#audit-list');
    list.innerHTML = loadingState();

    var result = await D.listAudit({ limit: auditState.limit, offset: auditState.offset });
    if (result.error) { list.innerHTML = errorState(result.error); return; }

    auditState.rows = (result.data && result.data.entries) || [];
    auditState.total = (result.data && result.data.total) || 0;

    list.innerHTML = auditState.rows.length
      ? '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
        '<th>Quando</th><th>Quem</th><th>O que fez</th><th>Detalhes</th>' +
        '</tr></thead><tbody>' +
        auditState.rows.map(function (entry) {
          var detail = entry.detail
            ? Object.keys(entry.detail)
              .filter(function (key) { return entry.detail[key] != null; })
              .map(function (key) { return key.replace(/_/g, ' ') + ': ' + entry.detail[key]; })
              .join(' · ')
            : '';
          return '<tr>' +
            '<td>' + formatDateTime(entry.created_at) + '</td>' +
            '<td>' + esc(entry.admin_email || '—') + '</td>' +
            '<td>' + esc(auditLabel(entry.action)) + '</td>' +
            '<td class="muted">' + esc(detail) + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>'
      : emptyState('Nenhuma ação registrada ainda.');

    renderPager('audit-pager', auditState, loadAudit);
  }

  // ------------------------------------------------------------------
  // 2FA — ativação obrigatória no primeiro acesso
  // ------------------------------------------------------------------
  var mfaEnrollEl = $('#mfa-enroll');
  var mfaConfirmForm = $('#mfa-confirm-form');
  var enrollFactorId = null;

  $('#mfa-generate-btn').addEventListener('click', async function () {
    var button = this;
    setBusy(button, true, 'Gerando…');
    var result = await D.enroll();
    setBusy(button, false);
    if (result.error) { toast(result.error, 'error'); return; }

    enrollFactorId = result.factorId;
    var qrEl = $('#mfa-qr');
    qrEl.innerHTML = '';
    var qrValue = (result.qr || '').trim();
    if (/^<svg/i.test(qrValue)) {
      qrEl.innerHTML = qrValue;
    } else if (qrValue) {
      var img = document.createElement('img');
      img.alt = 'QR Code do 2FA';
      img.src = qrValue;
      qrEl.appendChild(img);
    }
    $('#mfa-secret').textContent = result.secret || '';
    $('#mfa-step-generate').hidden = true;
    $('#mfa-step-confirm').hidden = false;
  });

  mfaConfirmForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var feedback = $('#mfa-feedback');
    feedback.className = 'auth-feedback';
    feedback.textContent = '';

    var code = (mfaConfirmForm.elements.code.value || '').trim();
    if (!/^[0-9]{6}$/.test(code)) {
      feedback.classList.add('is-error');
      feedback.textContent = 'Digite os 6 dígitos do aplicativo.';
      return;
    }

    var button = $('#mfa-confirm-btn');
    setBusy(button, true, 'Ativando…');
    var result = await D.verifyFactor(enrollFactorId, code);
    setBusy(button, false);
    if (result.error) {
      feedback.classList.add('is-error');
      feedback.textContent = 'Código inválido. Tente novamente.';
      return;
    }

    mfaEnrollEl.hidden = true;
    await showAdmin();
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function showAdmin() {
    $('#content').hidden = false;
    loaded.overview = true;
    await Promise.all([loadOverview(), loadCategories()]);
  }

  $('#logout-btn').addEventListener('click', async function () {
    await A.signOut();
    location.replace('admin-login.html');
  });

  (async function init() {
    var session = await A.requireAuth('admin-login.html');
    if (!session) return;

    var allowed = await D.checkAccess();
    $('#loading').hidden = true;
    if (!allowed) { $('#denied').hidden = false; return; }

    // Trava real é no servidor (require-admin exige aal2); aqui é só o
    // fluxo da interface.
    var aal = await D.getAAL();
    if (aal.current === 'aal2') {
      await showAdmin();
    } else if (aal.next === 'aal2') {
      location.replace('admin-login.html');
    } else {
      mfaEnrollEl.hidden = false;
    }
  })();
})();

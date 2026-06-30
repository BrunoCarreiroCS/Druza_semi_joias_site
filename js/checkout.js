/* =====================================================================
   DRUZA — checkout.js
   Lê o carrinho salvo (druzaCartV1), revisa, escolhe endereço e chama
   a Edge Function create-preference. Redireciona para o init_point.
   Requer: js/config.js, supabase SDK, js/auth.js carregados antes.
   ===================================================================== */
(function () {
  'use strict';

  const A = window.DruzaAuth;
  const CART_KEY = 'druzaCartV1';
  const COUPON_CODE = 'PRIMEIRADRUZA';
  const COUPON_DISCOUNT = 0.10;
  const FREE_SHIPPING_THRESHOLD = 19900;
  const SHIPPING_RULES = [
    { prefixes: ['01', '02', '03', '04'], price: 1490 },
    { prefixes: ['20', '21', '22', '23', '24'], price: 1890 },
  ];
  const SHIPPING_FALLBACK = 2190;

  const els = {
    loading: document.getElementById('loading'),
    empty: document.getElementById('empty'),
    checkout: document.getElementById('checkout'),
    review: document.getElementById('review-items'),
    tSub: document.getElementById('t-sub'),
    tDisc: document.getElementById('t-disc'),
    rowDisc: document.getElementById('row-discount'),
    tShip: document.getElementById('t-ship'),
    tTotal: document.getElementById('t-total'),
    addressPick: document.getElementById('address-pick'),
    addressForm: document.getElementById('address-form'),
    newAddressWrap: document.getElementById('new-address-wrap'),
    payBtn: document.getElementById('pay-btn'),
    feedback: document.getElementById('feedback'),
  };

  function brl(cents) {
    return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatCep(value) {
    const d = String(value || '').replace(/\D/g, '').slice(0, 8);
    return d.replace(/^(\d{5})(\d{0,3}).*$/, (_, a, b) => (b ? `${a}-${b}` : a));
  }
  function shippingFor(cep, subtotal) {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
    const prefix = String(cep || '').replace(/\D/g, '').slice(0, 2);
    const rule = SHIPPING_RULES.find((r) => r.prefixes.includes(prefix));
    return rule ? rule.price : SHIPPING_FALLBACK;
  }

  // -----------------------------------------------------------------
  // Estado
  // -----------------------------------------------------------------
  let cart = null;
  let addresses = [];
  let selectedAddressId = null;
  let usingNewAddress = false;

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      const items = Array.isArray(saved.items) ? saved.items.filter((i) => i && i.id && i.quantity > 0) : [];
      cart = {
        items,
        coupon: saved.coupon === COUPON_CODE ? saved.coupon : null,
        shipping: saved.shipping || null,
      };
    } catch (e) { cart = { items: [], coupon: null, shipping: null }; }
  }

  function subtotalCents() {
    return cart.items.reduce((s, i) => s + (Number(i.priceCents) || 0) * (Number(i.quantity) || 1), 0);
  }
  function discountCents(sub) {
    return cart.coupon === COUPON_CODE ? Math.round(sub * COUPON_DISCOUNT) : 0;
  }
  function currentCep() {
    if (usingNewAddress) {
      const v = els.addressForm?.elements?.cep?.value || '';
      return v;
    }
    const addr = addresses.find((a) => a.id === selectedAddressId);
    return addr ? addr.cep : (cart.shipping && cart.shipping.cep) || '';
  }

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  function renderReview() {
    els.review.innerHTML = cart.items.map((i) => `
      <div class="review-line">
        <div class="review-line__media">${
          i.image ? `<img src="${esc(i.image)}" alt="">` : 'Foto<br>em breve'
        }</div>
        <div>
          <div class="review-line__name">${esc(i.name)}</div>
          <div class="review-line__meta">${i.quantity}× ${brl(i.priceCents)}${i.size ? ' · tamanho ' + esc(i.size) : ''}</div>
        </div>
        <div class="review-line__total">${brl((i.priceCents || 0) * (i.quantity || 1))}</div>
      </div>
    `).join('');
  }

  function renderTotals() {
    const sub = subtotalCents();
    const disc = discountCents(sub);
    const cep = currentCep();
    const ship = cep ? shippingFor(cep, sub) : null;
    const total = Math.max(0, sub - disc + (ship || 0));
    els.tSub.textContent = brl(sub);
    if (disc > 0) {
      els.rowDisc.hidden = false;
      els.tDisc.textContent = '− ' + brl(disc);
    } else {
      els.rowDisc.hidden = true;
    }
    els.tShip.textContent = ship === null ? 'Calculado após escolher endereço'
      : ship === 0 ? 'Grátis' : brl(ship);
    els.tTotal.textContent = brl(total);
  }

  function renderAddresses() {
    if (!addresses.length) {
      els.addressPick.hidden = true;
      // Já abre o form de novo endereço
      els.newAddressWrap.open = true;
      usingNewAddress = true;
      return;
    }
    els.addressPick.hidden = false;
    const first = addresses.find((a) => a.is_default) || addresses[0];
    selectedAddressId = first.id;
    els.addressPick.innerHTML = addresses.map((a) => `
      <label class="address-option">
        <input type="radio" name="addr" value="${esc(a.id)}" ${a.id === selectedAddressId ? 'checked' : ''} />
        <div>
          <div class="address-option__title">
            ${a.is_default ? '★ ' : ''}${esc(a.label || 'Endereço')}
          </div>
          <div class="address-option__body">
            ${esc(a.recipient)}<br>
            ${esc(a.street)}, ${esc(a.number)}${a.complement ? ' — ' + esc(a.complement) : ''}<br>
            ${esc(a.city)}/${esc(a.state)} · CEP ${esc(a.cep)}
          </div>
        </div>
      </label>
    `).join('');
    els.addressPick.querySelectorAll('input[name="addr"]').forEach((r) => {
      r.addEventListener('change', () => {
        selectedAddressId = r.value;
        usingNewAddress = false;
        els.newAddressWrap.open = false;
        renderTotals();
      });
    });
  }

  // -----------------------------------------------------------------
  // Submit / Pagar
  // -----------------------------------------------------------------
  function setError(msg) {
    els.feedback.className = 'auth-feedback is-error';
    els.feedback.textContent = msg;
  }
  function clearError() {
    els.feedback.className = 'auth-feedback';
    els.feedback.textContent = '';
  }

  function buildAddressFromForm() {
    const f = els.addressForm;
    if (!f) return null;
    const get = (n) => (f.elements[n]?.value || '').trim();
    const a = {
      recipient: get('recipient'),
      cep: get('cep'),
      street: get('street'),
      number: get('number'),
      complement: get('complement'),
      neighborhood: get('neighborhood'),
      city: get('city'),
      state: get('state').toUpperCase(),
      label: 'Endereço',
    };
    if (!a.recipient || !a.cep || !a.street || !a.number || !a.city || !a.state) return null;
    if (a.cep.replace(/\D/g, '').length !== 8) return null;
    return a;
  }

  async function pay() {
    clearError();
    if (!cart.items.length) { setError('Sua sacola está vazia.'); return; }

    const payload = {
      items: cart.items.map((i) => ({ slug: i.id, qty: i.quantity, size: i.size })),
      coupon: cart.coupon || undefined,
    };

    if (usingNewAddress || !selectedAddressId) {
      const a = buildAddressFromForm();
      if (!a) { setError('Preencha o endereço completo (CEP com 8 dígitos).'); return; }
      payload.address = a;
    } else {
      payload.address_id = selectedAddressId;
    }

    els.payBtn.disabled = true;
    els.payBtn.textContent = 'Preparando pagamento…';
    const { data, error } = await A.invokeFunction('create-preference', payload);
    if (error || !data?.init_point) {
      setError(error || 'Não foi possível iniciar o pagamento. Tente novamente.');
      els.payBtn.disabled = false;
      els.payBtn.textContent = 'Pagar com MercadoPago';
      return;
    }
    // Sucesso: redireciona para o MP
    location.href = data.init_point;
  }

  // -----------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------
  (async function init() {
    loadCart();
    if (!cart.items.length) {
      els.loading.hidden = true;
      els.empty.hidden = false;
      return;
    }

    // Exige login para checkout
    if (!A || !A.client) {
      els.loading.innerHTML = '<p>Erro de configuração: Supabase não inicializou.</p>';
      return;
    }
    const session = await A.getSession();
    if (!session) {
      const next = encodeURIComponent('checkout.html');
      location.replace('login.html?next=' + next);
      return;
    }

    // Carrega endereços
    const { data } = await A.listAddresses();
    addresses = data || [];

    renderReview();
    renderAddresses();
    renderTotals();

    els.loading.hidden = true;
    els.checkout.hidden = false;

    // Máscara de CEP no form novo + recálculo de totais
    els.addressForm?.addEventListener('input', (e) => {
      if (e.target.name === 'cep') e.target.value = formatCep(e.target.value);
      if (e.target.name === 'cep') renderTotals();
    });
    els.newAddressWrap?.addEventListener('toggle', () => {
      usingNewAddress = els.newAddressWrap.open;
      if (usingNewAddress) selectedAddressId = null;
      // Desmarca radios para deixar claro que o form novo está ativo
      if (usingNewAddress) {
        els.addressPick.querySelectorAll('input[name="addr"]').forEach((r) => (r.checked = false));
      }
      renderTotals();
    });

    els.payBtn.addEventListener('click', pay);
  })();
})();

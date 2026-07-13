/* =====================================================================
   DRUZA — checkout.js
   Lê o carrinho salvo (druzaCartV1), revisa, escolhe endereço, cria o
   pedido via create-order e monta o Payment Brick (checkout embutido do
   MercadoPago) para pagar sem sair do site nem precisar de conta MP.
   Requer: js/config.js, supabase SDK, js/auth.js e o SDK do MercadoPago
   (https://sdk.mercadopago.com/js/v2) carregados antes.
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
    goToPaymentBtn: document.getElementById('go-to-payment-btn'),
    brickContainer: document.getElementById('paymentBrick_container'),
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
  let userEmail = null;
  let orderId = null;

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

  async function goToPayment() {
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

    els.goToPaymentBtn.disabled = true;
    els.goToPaymentBtn.textContent = 'Preparando pagamento…';
    const { data, error } = await A.invokeFunction('create-order', payload);
    if (error || !data?.order_id) {
      setError(error || 'Não foi possível iniciar o pagamento. Tente novamente.');
      els.goToPaymentBtn.disabled = false;
      els.goToPaymentBtn.textContent = 'Ir para pagamento';
      return;
    }

    orderId = data.order_id;
    els.goToPaymentBtn.hidden = true;
    els.brickContainer.hidden = false;
    await mountBrick(data.total_cents);
  }

  // bricksBuilder.create() exige onReady e/ou onError nos callbacks — sem
  // onReady, o SDK rejeita com "Callbacks onReady and/or onError are
  // required" e o container fica preso no skeleton de carregamento pra
  // sempre (a rejeição nunca chegava a aparecer até isso ser investigado,
  // porque nada estava logando o catch). onReady não precisa fazer nada.
  async function mountBrick(totalCents) {
    const mp = new MercadoPago(window.DRUZA_CONFIG.MP_PUBLIC_KEY, { locale: 'pt-BR' });
    const bricksBuilder = mp.bricks();
    try {
      await bricksBuilder.create('payment', 'paymentBrick_container', {
        initialization: {
          amount: totalCents / 100,
          payer: userEmail ? { email: userEmail } : undefined,
        },
        customization: {
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
            bankTransfer: ['pix'],
          },
        },
        callbacks: {
          onReady: () => {},
          onSubmit: handleBrickSubmit,
          onError: handleBrickError,
        },
      });
    } catch (err) {
      // Falha ao MONTAR o formulário (ex.: SDK não carregou) — isso sim
      // é um erro que impede o pagamento e merece aviso ao cliente.
      console.error('Payment Brick mount error', err);
      setError('Não foi possível carregar o formulário de pagamento. Recarregue a página e tente novamente.');
    }
  }

  // O onSubmit do Brick DEVE retornar uma promise: se ela resolver, o Brick
  // considera o pagamento concluído; se rejeitar, ele reabilita o formulário
  // pro cliente corrigir/tentar de novo. Por isso, em qualquer falha (rede,
  // cartão recusado) fazemos throw — senão o Brick mostraria "sucesso" sobre
  // um cartão recusado e o cliente ficaria preso.
  async function handleBrickSubmit({ formData }) {
    clearError();
    const { data, error } = await A.invokeFunction('process-payment', {
      order_id: orderId,
      ...formData,
    });
    if (error) {
      setError(error);
      throw new Error(error);
    }
    if (data.status === 'paid') {
      clearCart();
      location.href = 'pagamento-sucesso.html?order=' + orderId;
      return;
    }
    if (data.status === 'pending') {
      clearCart();
      if (data.pix) {
        showPix(data.pix); // Pix: mostra QR/copia-e-cola na própria página
      } else {
        location.href = 'pagamento-pendente.html?order=' + orderId;
      }
      return;
    }
    // Recusado (canceled) ou status inesperado: mostra o erro e rejeita a
    // promise pra o Brick reabilitar o formulário.
    const msg = data.detail || data.error || 'Pagamento recusado. Tente outro cartão.';
    setError(msg);
    throw new Error(msg);
  }

  function showPix(pix) {
    els.brickContainer.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.textAlign = 'center';

    const title = document.createElement('p');
    title.textContent = 'Pague com Pix: escaneie o QR Code no app do seu banco ou copie o código abaixo.';
    title.style.marginBottom = 'var(--space-4)';
    wrap.appendChild(title);

    if (pix.qr_code_base64) {
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,' + pix.qr_code_base64;
      img.alt = 'QR Code Pix';
      img.style.maxWidth = '220px';
      img.style.display = 'block';
      img.style.margin = '0 auto var(--space-4)';
      wrap.appendChild(img);
    }

    if (pix.qr_code) {
      const code = document.createElement('textarea');
      code.readOnly = true;
      code.value = pix.qr_code;
      code.rows = 3;
      code.style.width = '100%';
      code.style.marginBottom = 'var(--space-2)';
      wrap.appendChild(code);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn--secondary';
      copyBtn.textContent = 'Copiar código Pix';
      copyBtn.addEventListener('click', () => {
        code.select();
        try { navigator.clipboard.writeText(pix.qr_code); } catch (e) { document.execCommand('copy'); }
        copyBtn.textContent = 'Código copiado ✓';
      });
      wrap.appendChild(copyBtn);
    }

    const note = document.createElement('p');
    note.textContent = 'Assim que o pagamento for confirmado, seu pedido entra em produção. Acompanhe em Minha conta.';
    note.style.margin = 'var(--space-4) 0';
    note.style.color = 'var(--muted)';
    note.style.fontSize = '0.9rem';
    wrap.appendChild(note);

    const link = document.createElement('a');
    link.href = 'conta.html';
    link.className = 'btn btn--primary';
    link.textContent = 'Acompanhar pedido';
    link.style.display = 'inline-block';
    wrap.appendChild(link);

    els.brickContainer.appendChild(wrap);
    els.brickContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearCart() {
    try { localStorage.removeItem(CART_KEY); } catch (e) { /* ignore */ }
  }

  function handleBrickError(error) {
    // onError do Brick dispara para MUITOS eventos que NÃO impedem o
    // pagamento: validação de campo, inferência de bandeira durante a
    // digitação ("Cannot infer Payment Method"), etc. O próprio Brick já
    // mostra esses erros inline no campo certo, então aqui só registramos
    // no console — nunca jogamos um erro vermelho por cima. Falhas reais
    // de carregamento são tratadas no catch do mountBrick, e falhas de
    // cobrança no handleBrickSubmit.
    console.error('Payment Brick error', error);
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
    userEmail = session.user?.email || null;

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

    els.goToPaymentBtn.addEventListener('click', goToPayment);
  })();
})();

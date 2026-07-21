const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/KABUM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:5002';
const OUT = __dirname;
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const errors = [];

  // ---- Desktop: produto -> sacola -> checkout ----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[desktop] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[desktop pageerror] ' + e.message));

  await page.goto(BASE + '/produtos/anel-coracao-esmeralda.html', { waitUntil: 'networkidle' });
  const addBtn = page.locator('[data-add]').first();
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await page.waitForTimeout(600);
  const thumb = await page.evaluate(() => {
    const img = document.querySelector('.drawer.is-open .cart-line img');
    return img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 } : null;
  });
  results.push({ check: 'thumbnail no drawer (pagina de produto)', thumb });
  await shot(page, 'fix-01-drawer-produto');

  const storage = await page.evaluate(() => ({
    druzaCartV1: JSON.parse(localStorage.getItem('druzaCartV1')),
    druza_cart: localStorage.getItem('druza_cart'),
  }));
  results.push({ check: 'localStorage apos adicionar', storage });

  await page.locator('.drawer.is-open a:has-text("Finalizar compra")').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    url: location.href,
    emptyVisible: document.getElementById('empty') ? !document.getElementById('empty').hidden : null,
  }));
  // Sem login: sacola cheia deve REDIRECIONAR para login (antes mostrava "vazia")
  results.push({ check: 'checkout com sacola cheia (sem login)', after });
  await shot(page, 'fix-02-checkout-redireciona-login');

  // ---- Migracao da sacola legada ----
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p2.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('druza_cart', JSON.stringify([
      { id: 'pulseira-riviera-prata', name: 'Pulseira Riviera Prata', price: 159, img: 'img/pulseiras-riviera.webp', size: 'Único', qty: 2 },
    ]));
  });
  await p2.reload({ waitUntil: 'networkidle' });
  const migrated = await p2.evaluate(() => ({
    druzaCartV1: JSON.parse(localStorage.getItem('druzaCartV1')),
    legacyRemovida: localStorage.getItem('druza_cart') === null,
    badge: document.querySelector('[data-cart-count]') ? document.querySelector('[data-cart-count]').textContent : null,
  }));
  results.push({ check: 'migracao druza_cart -> druzaCartV1', migrated });

  // coupon/shipping preservados quando a vitrine regrava
  await p2.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('druzaCartV1'));
    saved.coupon = 'PRIMEIRADRUZA';
    saved.shipping = { cep: '01001000' };
    localStorage.setItem('druzaCartV1', JSON.stringify(saved));
  });
  await p2.reload({ waitUntil: 'networkidle' });
  // remove 1 item pela vitrine (regrava a sacola) e confere coupon/shipping
  await p2.locator('[data-open="cart"]').first().click();
  await p2.waitForTimeout(400);
  const preserved = await p2.evaluate(() => {
    document.querySelector('[data-rm]').click();
    const saved = JSON.parse(localStorage.getItem('druzaCartV1'));
    return { coupon: saved.coupon, shipping: saved.shipping, items: saved.items.length };
  });
  results.push({ check: 'coupon/shipping preservados apos writeCart', preserved });

  // ---- Mobile: mesmo fluxo principal ----
  const mctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
  });
  const mp = await mctx.newPage();
  mp.on('console', (m) => { if (m.type() === 'error') errors.push('[mobile] ' + m.text()); });
  await mp.goto(BASE + '/produtos/pulseira-riviera-prata.html', { waitUntil: 'networkidle' });
  const mAdd = mp.locator('[data-add]').first();
  await mAdd.scrollIntoViewIfNeeded();
  await mAdd.click();
  await mp.waitForTimeout(600);
  const mThumb = await mp.evaluate(() => {
    const img = document.querySelector('.drawer.is-open .cart-line img');
    return img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 } : null;
  });
  results.push({ check: 'mobile: thumbnail drawer', mThumb });
  await shot(mp, 'fix-03-mobile-drawer');
  await mp.locator('.drawer.is-open a:has-text("Finalizar compra")').click();
  await mp.waitForLoadState('networkidle');
  await mp.waitForTimeout(800);
  results.push({ check: 'mobile: destino apos finalizar', url: mp.url() });
  await shot(mp, 'fix-04-mobile-apos-finalizar');

  fs.writeFileSync(path.join(OUT, 'verify-notes.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });

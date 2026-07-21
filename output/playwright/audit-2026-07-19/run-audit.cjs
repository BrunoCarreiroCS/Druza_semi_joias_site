const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/KABUM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:5002';
const OUT = __dirname;

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
}

(async () => {
  const browser = await chromium.launch();
  const notes = [];

  // ---------- DESKTOP ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[desktop] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[desktop pageerror] ' + e.message));

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await shot(page, 'desktop-01-home');

  await page.goto(BASE + '/catalogo.html', { waitUntil: 'networkidle' });
  await shot(page, 'desktop-02-catalogo');

  await page.goto(BASE + '/produtos/anel-coracao-esmeralda.html', { waitUntil: 'networkidle' });
  await shot(page, 'desktop-03-produto');

  // Add to cart via the real button
  const addBtn = page.locator('[data-add]').first();
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await page.waitForTimeout(600);
  await shot(page, 'desktop-04-sacola-drawer');

  const storageAfterAdd = await page.evaluate(() => ({
    druza_cart: localStorage.getItem('druza_cart'),
    druzaCartV1: localStorage.getItem('druzaCartV1'),
  }));
  notes.push({ step: 'apos adicionar a sacola (produto)', storage: storageAfterAdd });

  // Click "Finalizar compra" in the drawer -> checkout
  await page.locator('.drawer.is-open a:has-text("Finalizar compra")').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await shot(page, 'desktop-05-checkout-resultado');
  const checkoutState = await page.evaluate(() => ({
    url: location.href,
    emptyVisible: !document.getElementById('empty')?.hidden,
    emptyText: document.getElementById('empty')?.innerText || null,
    druza_cart: localStorage.getItem('druza_cart'),
    druzaCartV1: localStorage.getItem('druzaCartV1'),
  }));
  notes.push({ step: 'checkout apos finalizar compra', state: checkoutState });

  // Auth pages
  await page.goto(BASE + '/login.html', { waitUntil: 'networkidle' });
  await shot(page, 'desktop-06-login');
  await page.goto(BASE + '/cadastro.html', { waitUntil: 'networkidle' });
  await shot(page, 'desktop-07-cadastro');

  // ---------- MOBILE ----------
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const mp = await mobile.newPage();
  mp.on('console', (m) => { if (m.type() === 'error') errors.push('[mobile] ' + m.text()); });
  mp.on('pageerror', (e) => errors.push('[mobile pageerror] ' + e.message));

  await mp.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await shot(mp, 'mobile-01-home');

  // open mobile menu (quick-nav flutuante)
  const menuBtn = mp.locator('.quick-nav__trigger');
  if (await menuBtn.count()) {
    await menuBtn.click();
    await mp.waitForTimeout(400);
    await shot(mp, 'mobile-02-menu');
    await mp.keyboard.press('Escape');
    const menuState = await mp.evaluate(() => {
      const panel = document.querySelector('.quick-nav__panel');
      return panel ? { openAposEscape: panel.classList.contains('is-open') } : null;
    });
    notes.push({ step: 'quick-nav mobile apos Escape', state: menuState });
  }

  await mp.goto(BASE + '/catalogo.html', { waitUntil: 'networkidle' });
  await shot(mp, 'mobile-03-catalogo');

  await mp.goto(BASE + '/produtos/pulseira-riviera-prata.html', { waitUntil: 'networkidle' });
  await shot(mp, 'mobile-04-produto');
  const mAdd = mp.locator('[data-add]').first();
  await mAdd.scrollIntoViewIfNeeded();
  await mAdd.click();
  await mp.waitForTimeout(600);
  await shot(mp, 'mobile-05-sacola-drawer');

  await mp.locator('.drawer.is-open a:has-text("Finalizar compra")').click();
  await mp.waitForLoadState('networkidle');
  await mp.waitForTimeout(800);
  await shot(mp, 'mobile-06-checkout-resultado');
  const mCheckout = await mp.evaluate(() => ({
    emptyVisible: !document.getElementById('empty')?.hidden,
    druza_cart: localStorage.getItem('druza_cart'),
  }));
  notes.push({ step: 'checkout mobile', state: mCheckout });

  // horizontal overflow check on key mobile pages
  for (const [name, route] of [['home', '/index.html'], ['catalogo', '/catalogo.html'], ['produto', '/produto.html'], ['checkout', '/checkout.html'], ['login', '/login.html']]) {
    await mp.goto(BASE + route, { waitUntil: 'networkidle' });
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    notes.push({ step: 'overflow-x mobile ' + name, px: overflow });
  }

  fs.writeFileSync(path.join(OUT, 'notes.json'), JSON.stringify({ notes, errors }, null, 2));
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });

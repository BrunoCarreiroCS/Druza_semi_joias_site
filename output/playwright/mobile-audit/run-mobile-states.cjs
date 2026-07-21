const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/KABUM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const BASE_URL = 'http://127.0.0.1:5510';
const PHASE = process.argv[2] || 'baseline-states';
const OUTPUT = path.join(__dirname, PHASE);
const DEVICES = [
  {
    id: 'iphone-13',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'samsung-s23',
    viewport: { width: 360, height: 780 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  },
];

const STATES = [
  {
    id: 'home-quick-nav',
    route: '/index.html',
    action: async (page) => page.locator('[data-quick-nav-open]').click(),
  },
  {
    id: 'home-cart-empty',
    route: '/index.html',
    action: async (page) => page.locator('[data-open="cart"]').click(),
  },
  {
    id: 'produto-cart-item',
    route: '/produto.html?slug=anel-paraiba-quadrado',
    action: async (page) => {
      await page.locator('[data-buy-anchor] [data-add]').click();
      await page.waitForTimeout(250);
    },
  },
  {
    id: 'produto-sticky-buy',
    route: '/produto.html?slug=anel-paraiba-quadrado',
    action: async (page) => {
      await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.48)));
      await page.waitForTimeout(450);
    },
  },
  {
    id: 'trocas-details-open',
    route: '/trocas.html',
    fullPage: true,
    action: async (page) => page.locator('details').evaluateAll((details) => details.forEach((detail) => { detail.open = true; })),
  },
  {
    id: 'login-password-control',
    route: '/login.html',
    action: async (page) => {
      await page.locator('input[type="password"]').fill('Senha de teste muito longa 123!');
      await page.locator('[data-pw-toggle]').click();
    },
  },
];

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const selector = (element) => element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 3).map((name) => `.${name}`).join('')}`;
    const activeLayers = [...document.querySelectorAll('.is-open, .is-visible, details[open]')]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: selector(element), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
    const offscreen = [...document.querySelectorAll('.is-open, .is-visible')]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -2 || rect.right > innerWidth + 2;
      })
      .map(selector);
    const smallControls = [...document.querySelectorAll('button, input, select, textarea, summary')]
      .filter(visible)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .map(({ element, rect }) => ({ selector: selector(element), width: Math.round(rect.width), height: Math.round(rect.height) }));
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      activeLayers,
      offscreen,
      smallControls,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: device.viewport,
      userAgent: device.userAgent,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      reducedMotion: 'reduce',
    });
    const deviceDir = path.join(OUTPUT, device.id);
    fs.mkdirSync(deviceDir, { recursive: true });

    for (const state of STATES) {
      const page = await context.newPage();
      const result = { device: device.id, state: state.id, route: state.route, pageErrors: [] };
      page.on('pageerror', (error) => result.pageErrors.push(error.message));
      try {
        await page.goto(`${BASE_URL}${state.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(350);
        await state.action(page);
        await page.waitForTimeout(350);
        result.dom = await inspect(page);
        await page.screenshot({
          path: path.join(deviceDir, `${state.id}.jpg`),
          type: 'jpeg',
          quality: 78,
          fullPage: Boolean(state.fullPage),
        });
      } catch (error) {
        result.fatal = error.message;
      }
      results.push(result);
      process.stdout.write(`${device.id} ${state.id} ${result.fatal ? 'FATAL' : 'OK'}\n`);
      await page.close();
    }
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

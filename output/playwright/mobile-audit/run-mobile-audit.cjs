const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/KABUM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE_URL = 'http://127.0.0.1:5510';
const PHASE = process.argv[2] || 'baseline';
const PHASE_DIR = path.join(__dirname, PHASE);

const ROUTES = [
  ['home', '/index.html'],
  ['catalogo', '/catalogo.html'],
  ['brincos', '/brincos.html'],
  ['produto-generico', '/produto.html?slug=anel-paraiba-quadrado'],
  ['produto-pulseira-riviera', '/produtos/pulseira-riviera-prata.html'],
  ['produto-colar-ponto-luz', '/produtos/colar-ponto-luz-paraiba.html'],
  ['produto-brinco-ponto-luz', '/produtos/brinco-ponto-luz.html'],
  ['produto-brinco-gota', '/produtos/brinco-gota-esmeralda.html'],
  ['produto-argolinha', '/produtos/argolinha-paraiba.html'],
  ['produto-anel-paraiba', '/produtos/anel-paraiba-quadrado.html'],
  ['produto-anel-coracao', '/produtos/anel-coracao-esmeralda.html'],
  ['sobre', '/sobre.html'],
  ['contato', '/contato.html'],
  ['cuidados', '/cuidados.html'],
  ['trocas', '/trocas.html'],
  ['privacidade', '/privacidade.html'],
  ['login', '/login.html'],
  ['cadastro', '/cadastro.html'],
  ['recuperar-senha', '/recuperar-senha.html'],
  ['redefinir-senha', '/redefinir-senha.html'],
  ['pagamento-sucesso', '/pagamento-sucesso.html'],
  ['pagamento-pendente', '/pagamento-pendente.html'],
  ['pagamento-falha', '/pagamento-falha.html'],
];

const DEVICES = [
  {
    id: 'iphone-13',
    label: 'iPhone 13 / 14',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'samsung-s23',
    label: 'Samsung Galaxy S23 / S24',
    viewport: { width: 360, height: 780 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function scrollEntirePage(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(480, Math.floor(window.innerHeight * 0.75));
    for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
      window.scrollTo(0, top);
      await delay(55);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await delay(180);
    window.scrollTo(0, 0);
    await delay(180);
  });
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
      return `${element.tagName.toLowerCase()}${classes}`;
    };
    const compactText = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const hiddenByState = (element) => Boolean(element.closest(
      '[hidden], [aria-hidden="true"], .drawer:not(.is-open), .overlay:not(.is-open), .mobile-menu:not(.is-open), .cart-drawer:not(.is-open)'
    )) || Boolean(element.closest('details:not([open])') && !element.closest('summary'));
    const isVisible = (element) => {
      if (hiddenByState(element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.01
        && rect.width > 0.5
        && rect.height > 0.5;
    };
    const rounded = (value) => Math.round(value * 10) / 10;
    const all = [...document.querySelectorAll('body *')];

    const horizontalOverflow = all
      .filter((element) => !['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(element.tagName) && isVisible(element))
      .map((element) => ({ element, rect: element.getBoundingClientRect(), style: getComputedStyle(element) }))
      .filter(({ rect, style }) => {
        if (style.position === 'fixed' && (rect.right <= 0 || rect.left >= innerWidth)) return false;
        return rect.left < -2 || rect.right > innerWidth + 2;
      })
      .slice(0, 30)
      .map(({ element, rect }) => ({
        selector: selectorFor(element),
        text: compactText(element),
        left: rounded(rect.left),
        right: rounded(rect.right),
        viewport: innerWidth,
      }));

    const clippedText = all
      .filter((element) => isVisible(element) && compactText(element) && !element.closest('.sr-only'))
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.webkitLineClamp && style.webkitLineClamp !== 'none') return false;
        const clipsX = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
        const clipsY = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
        return clipsX || clipsY;
      })
      .slice(0, 30)
      .map((element) => ({
        selector: selectorFor(element),
        text: compactText(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));

    const brokenImages = [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => ({ selector: selectorFor(image), src: image.currentSrc || image.src, alt: image.alt }));

    const pendingImages = [...document.images]
      .filter((image) => !image.complete)
      .map((image) => ({ selector: selectorFor(image), src: image.currentSrc || image.src, alt: image.alt }));

    const distortedImages = [...document.images]
      .filter((image) => isVisible(image) && image.naturalWidth > 0 && image.naturalHeight > 0)
      .filter((image) => {
        const style = getComputedStyle(image);
        if (['cover', 'contain', 'scale-down'].includes(style.objectFit)) return false;
        const rect = image.getBoundingClientRect();
        const renderedWidth = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const renderedHeight = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const intrinsic = image.naturalWidth / image.naturalHeight;
        const rendered = renderedWidth / renderedHeight;
        return Math.abs(intrinsic - rendered) / intrinsic > 0.08;
      })
      .map((image) => ({ selector: selectorFor(image), src: image.currentSrc || image.src }));

    const interactive = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"], [tabindex]')]
      .filter((element) => isVisible(element) && !element.disabled);

    const coveredControls = interactive
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
        const top = document.elementFromPoint(x, y);
        return top && top !== element && !element.contains(top) && !top.contains(element);
      })
      .slice(0, 30)
      .map((element) => ({ selector: selectorFor(element), text: compactText(element) }));

    const smallTouchTargets = interactive
      .filter((element) => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(element.tagName) || element.matches('.icon-btn, .nav-toggle, .announce__close'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .slice(0, 40)
      .map(({ element, rect }) => ({
        selector: selectorFor(element),
        text: compactText(element),
        width: rounded(rect.width),
        height: rounded(rect.height),
      }));

    const ids = new Map();
    for (const element of all) {
      if (!element.id) continue;
      ids.set(element.id, (ids.get(element.id) || 0) + 1);
    }

    return {
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow,
      clippedText,
      brokenImages,
      pendingImages,
      distortedImages,
      coveredControls,
      smallTouchTargets,
      duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })),
      imageCount: document.images.length,
      interactiveCount: interactive.length,
    };
  });
}

function issueCount(result) {
  const dom = result.dom || {};
  return (result.localResourceErrors || []).length
    + (result.pageErrors || []).length
    + (dom.horizontalOverflow || []).length
    + (dom.clippedText || []).length
    + (dom.brokenImages || []).length
    + (dom.pendingImages || []).length
    + (dom.distortedImages || []).length
    + (dom.coveredControls || []).length
    + (dom.duplicateIds || []).length;
}

function buildGallery(report) {
  const deviceSections = DEVICES.map((device) => {
    const pages = report.results.filter((result) => result.device === device.id).map((result) => `
      <article class="shot ${issueCount(result) ? 'has-issues' : ''}">
        <header>
          <div><strong>${escapeHtml(result.name)}</strong><span>${escapeHtml(result.route)}</span></div>
          <b>${issueCount(result)} alertas</b>
        </header>
        <a href="${device.id}/${result.name}.jpg" target="_blank" rel="noreferrer">
          <img src="${device.id}/${result.name}.jpg" alt="Captura mobile de ${escapeHtml(result.name)} em ${escapeHtml(device.label)}">
        </a>
      </article>`).join('');
    return `<section><h2>${escapeHtml(device.label)} · ${device.viewport.width} × ${device.viewport.height}</h2><div class="grid">${pages}</div></section>`;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Druza · auditoria mobile · ${escapeHtml(PHASE)}</title>
  <style>
    :root { color-scheme: light; --ink:#241f21; --muted:#71676b; --rose:#b97981; --line:#e9e4e5; --bg:#f8f5f6; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial,sans-serif; color:var(--ink); background:var(--bg); }
    main { width:min(1480px,100%); margin:auto; padding:32px clamp(18px,4vw,56px) 80px; }
    h1 { margin:0; font:500 clamp(2rem,4vw,4rem)/1.05 Georgia,serif; }
    .lead { color:var(--muted); margin:10px 0 42px; }
    section + section { margin-top:64px; }
    h2 { font:500 clamp(1.4rem,2vw,2rem)/1.15 Georgia,serif; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:22px; align-items:start; }
    .shot { background:white; border:1px solid var(--line); }
    .shot.has-issues { border-color:var(--rose); }
    header { display:flex; justify-content:space-between; gap:12px; padding:14px; border-bottom:1px solid var(--line); }
    header div { min-width:0; display:grid; gap:3px; }
    header span { color:var(--muted); font-size:.72rem; overflow-wrap:anywhere; }
    header b { flex:none; color:var(--rose); font-size:.72rem; }
    a { display:block; max-height:700px; overflow:auto; background:#eee; }
    img { display:block; width:100%; height:auto; }
  </style>
</head>
<body><main>
  <h1>Auditoria mobile · ${escapeHtml(PHASE)}</h1>
  <p class="lead">${report.results.length} renderizações · gerado em ${escapeHtml(report.generatedAt)}</p>
  ${deviceSections}
</main></body></html>`;
}

async function main() {
  fs.mkdirSync(PHASE_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { phase: PHASE, generatedAt: new Date().toISOString(), baseUrl: BASE_URL, results: [] };

  for (const device of DEVICES) {
    const deviceDir = path.join(PHASE_DIR, device.id);
    fs.mkdirSync(deviceDir, { recursive: true });
    const context = await browser.newContext({
      viewport: device.viewport,
      userAgent: device.userAgent,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });

    for (const [name, route] of ROUTES) {
      const page = await context.newPage();
      const result = {
        name,
        route,
        device: device.id,
        deviceLabel: device.label,
        localResourceErrors: [],
        externalResourceErrors: [],
        pageErrors: [],
        consoleErrors: [],
      };

      page.on('pageerror', (error) => result.pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') result.consoleErrors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        const target = response.url().startsWith(BASE_URL) ? result.localResourceErrors : result.externalResourceErrors;
        target.push({ status: response.status(), url: response.url() });
      });
      page.on('requestfailed', (request) => {
        const target = request.url().startsWith(BASE_URL) ? result.localResourceErrors : result.externalResourceErrors;
        target.push({ status: 'failed', url: request.url(), error: request.failure()?.errorText || '' });
      });

      try {
        const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        result.navigationStatus = response?.status() || null;
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(500);
        await scrollEntirePage(page);
        result.dom = await inspectPage(page);
        await page.screenshot({
          path: path.join(deviceDir, `${name}.jpg`),
          type: 'jpeg',
          quality: 72,
          fullPage: true,
        });
      } catch (error) {
        result.fatal = error.message;
      }

      report.results.push(result);
      await page.close();
      process.stdout.write(`${device.id} ${name} ${result.fatal ? 'FATAL' : issueCount(result)}\n`);
    }

    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(PHASE_DIR, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(PHASE_DIR, 'index.html'), buildGallery(report));
  process.stdout.write(`REPORT ${path.join(PHASE_DIR, 'report.json')}\n`);
  process.stdout.write(`GALLERY ${BASE_URL}/output/playwright/mobile-audit/${PHASE}/index.html\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

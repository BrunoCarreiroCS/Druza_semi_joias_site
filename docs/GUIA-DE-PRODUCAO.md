# Guia de Produção — Druza Semi Joias

Documentação das **próximas etapas** para transformar o protótipo atual em um site
**profissional, funcional e pronto para vender**. Complementa o `README.md` (estado/risco
técnico) e o `DIRECAO-DE-ARTE.md` (design system).

## Onde estamos hoje

- Protótipo estático premium (HTML/CSS/JS puro), **mobile-first**, sem framework.
- Home editorial + página de produto + páginas de conteúdo (`sobre`, `cuidados`, `trocas`,
  `contato`, `privacidade`).
- Catálogo local em `js/catalog.js`; **sacola, cupom, frete e checkout são simulados**
  (`localStorage`), sem backend, pagamento, login ou e-mail reais.
- Fotos reais **otimizadas** (`anel-paraiba.jpg`, `pulseiras-riviera.jpg`,
  `anel-coracao.jpg`) e **placeholders premium** (`.ph`, "Foto em breve") onde faltam fotos.

## Como usar este guia

Fases em ordem sugerida. Cada uma tem **objetivo**, **tarefas** e **critério de pronto**.
🔑 marca uma **decisão do dono** (não dá para automatizar — depende do negócio).

---

## Fase 1 — Conteúdo real

**Objetivo:** eliminar todo dado de exemplo.

- Catálogo real em `js/catalog.js`: nome, **preço, parcelas, SKU, estoque**, variações
  (tamanho), descrição, material (prata 925, banho), medidas e cuidados por produto.
- **Fotos reais de produto**: estúdio em fundo neutro (4:5), close macro da pedra, e
  lifestyle — substituindo os blocos `.ph` e as fotos reaproveitadas.
- Textos institucionais e **legais reais** (Sobre, Cuidados, Trocas/Devoluções, Garantia,
  Privacidade, FAQ) — com **revisão jurídica**.
- Dados da marca: **WhatsApp oficial**, redes sociais, razão social, CNPJ, endereço.

**Pronto quando:** nenhum selo `Exemplo`/`placeholder`, nenhum `<!-- PLACEHOLDER -->` e
nenhum `https://wa.me/` genérico restarem.

## Fase 2 — 🔑 Plataforma e tecnologia

**Objetivo:** decidir como o site vai realmente vender.

- **A) Estático + headless commerce** (ex.: Snipcart, Shopify Storefront API, Nuvemshop
  headless): mantém este front-end e pluga carrinho/checkout reais.
- **B) Migrar o design para uma plataforma BR** (Nuvemshop, Shopify, Loja Integrada, Yampi)
  como tema: já vem com checkout, pagamento, frete, estoque e painel.
- **C) Stack próprio** (ex.: Next.js + CMS headless + gateway): máximo controle, maior custo
  e manutenção.

**Recomendação:** para uma marca de semi joias iniciando, **B** (plataforma brasileira) ou
**A** (headless) — evitam construir backend fiscal/pagamento do zero.

**Pronto quando:** plataforma escolhida e conta criada.

## Fase 3 — Comércio real (checkout · pagamento · frete · pedidos)

**Objetivo:** uma compra de verdade, ponta a ponta.

- Carrinho/checkout reais (substituem a simulação em `js/main.js`/`UI_CONTRACT`).
- **Pagamento**: 🔑 gateway (Mercado Pago, Pagar.me, PagSeguro, Stripe) com **Pix + cartão**.
- **Frete real** por CEP (Correios / Melhor Envio / transportadora).
- Cupons e promoções no painel da plataforma.
- **E-mails transacionais** (confirmação, envio) + **newsletter** (🔑 Mailchimp, RD Station,
  Klaviyo).
- Conta/login do cliente, se necessário.

**Pronto quando:** um **pedido-teste em sandbox** percorre carrinho → pagamento → confirmação
→ e-mail.

## Fase 4 — Imagens e performance

**Objetivo:** rápido em qualquer dispositivo.

- **WebP/AVIF** com `<picture>` + fallback; variantes responsivas (`srcset`/`sizes`).
  - _(Hoje: JPEG q82 ≤1200px. WebP pendente — faltou ferramenta na máquina; rodar
    `cwebp`/`squoosh`/`sharp` quando disponível.)_
- **OG image dedicada** 1200×630 (substituir o logo na meta `og:image`).
- Auto-hospedar/subsetar as fontes (Cormorant + Jost) e remover render-block.
- **Lighthouse ≥ 90** em Performance/SEO/Best Practices/A11y; Core Web Vitals (LCP, CLS,
  INP) no verde.
- Remover assets originais não usados (`img/Captura de tela ….png`).

**Pronto quando:** Lighthouse mobile ≥ 90 e CWV ok.

## Fase 5 — SEO

- Título/meta/`canonical` por página; **`sitemap.xml`** e **`robots.txt`**.
- **JSON-LD** `Product`/`Offer`/`BreadcrumbList`/`Organization` com **dados reais**.
- URLs amigáveis com **páginas dedicadas por produto e categoria** (hoje várias apontam para
  `produto.html`).
- Conteúdo para termos-foco (guia de cuidados, blog): _semi joias em prata, anel feminino
  prata, anel com pedra verde, presente feminino sofisticado_.
- **Google Search Console** + envio do sitemap.

**Pronto quando:** páginas indexáveis, sitemap enviado e dados estruturados validados.

## Fase 6 — Analytics e medição

- **GA4** com eventos de e-commerce: `view_item`, `add_to_cart`, `begin_checkout`, `purchase`.
- Meta Pixel / TikTok Pixel se houver mídia paga.
- **Banner de consentimento de cookies (LGPD)**.

**Pronto quando:** funil de compra mensurável e consentimento ativo.

## Fase 7 — Acessibilidade e QA

- Auditoria final com a skill `web-design-guidelines`; teste com **leitor de tela no mobile**.
- Contraste AA, foco visível, navegação 100% por teclado.
- QA cross-browser/dispositivo do **fluxo de compra completo**.
- (Opcional) testes automatizados leves de sacola, cupom, frete e checkout.

**Pronto quando:** fluxo de compra passa em desktop e mobile, sem erros de console.

## Fase 8 — Deploy, domínio e ambientes

- Hospedagem: estático/headless → **Netlify / Vercel / Cloudflare Pages**; plataforma → a
  própria.
- **Domínio `druza.com.br`** + HTTPS + redirects (www → apex, http → https).
- **Staging** antes do produção; deploy a partir do `git`.
- Backup e versionamento garantidos.

**Pronto quando:** staging aprovado e produção no ar com HTTPS.

## Fase 9 — Pós-lançamento

- Monitorar **conversão, abandono de carrinho e CWV**.
- **CRO** contínuo: testes A/B em hero, CTAs e checkout.
- Conteúdo recorrente, novas coleções, **prova social real** (fotos/avaliações de clientes).
- Atualizações de segurança e dependências.

---

## ✅ Checklist "pronto para produção"

- [ ] Sem placeholders nem dados de exemplo (Fase 1)
- [ ] Plataforma definida (Fase 2)
- [ ] Checkout, pagamento (Pix/cartão) e frete reais **testados** (Fase 3)
- [ ] Textos legais revisados juridicamente (Fase 1)
- [ ] Imagens WebP + responsivas + OG image (Fase 4)
- [ ] Lighthouse mobile ≥ 90 e CWV ok (Fase 4)
- [ ] SEO: sitemap, robots, JSON-LD real, páginas por produto (Fase 5)
- [ ] GA4 + eventos + consentimento LGPD (Fase 6)
- [ ] Acessibilidade AA + QA cross-device (Fase 7)
- [ ] Domínio + HTTPS + staging (Fase 8)

## 🔑 Decisões pendentes do dono

| Tema | Opções típicas |
|---|---|
| Plataforma | Nuvemshop · Shopify · Loja Integrada · Yampi · headless · stack próprio |
| Pagamento | Mercado Pago · Pagar.me · PagSeguro · Stripe |
| Frete | Correios · Melhor Envio · transportadora |
| E-mail/Newsletter | Mailchimp · RD Station · Klaviyo |
| Marca | WhatsApp oficial · dados fiscais · políticas |

---

### Documentos relacionados
- `README.md` — estado técnico atual, riscos e contrato local de UI.
- `DIRECAO-DE-ARTE.md` — design system (paleta, tipografia, componentes, copy).

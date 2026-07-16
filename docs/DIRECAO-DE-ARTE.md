# Druza Semi Joias — Direção de Arte & Design System

Guia para designer/dev executar o site. Decisões **fechadas** estão marcadas; itens a
detalhar nas próximas fases aparecem como _(a expandir)_.

---

## 1. Posicionamento

Marca feminina de semi joias em **prata**, sofisticada, delicada e contemporânea. Combina
**brilho, elegância e presença**. Foco no detalhe das peças e no contraste entre prata e
**pedras verdes** (esmeralda / Paraíba). Comunicação premium, acessível e confiável.

**Primeiros 5 segundos:** branco, respiro, uma joia em destaque, tipografia elegante —
sensação de marca estabelecida, não de loja genérica.

**Evitar:** excesso de rosa · aparência infantil/“fofa” · bege/marfim dominante · luxo
pesado/brega · layout genérico de e-commerce · poluição de banners · animações pesadas.

## 2. Conceito

“Vitrine-joia editorial”: **base branca dominante**, **rosa da marca como assinatura
elegante**, **peças (prata + pedras verdes) em foco**. Variações sutis de branco quente só
para profundidade. Grafite suave no texto; prata/cinza claro nas hairlines; sombras discretas.

**Regra de marca:** o logo vive **no header** (discreto). O hero traz **foto real da joia
como protagonista**, em moldura/card premium — sem ícones/símbolos. O **verde** é só detalhe
das pedras, **nunca** logo ou símbolo principal.

## 3. Paleta (tokens)

| Token | Hex | Uso |
|---|---|---|
| `--white` | `#FFFFFF` | Base dominante |
| `--white-warm` | `#FDF8F8` | Profundidade sutil entre seções |
| `--blush` | `#FBF0F1` | Fundo suave institucional |
| `--rose-inst` | `#F4E3E5` | Fundo institucional + selos/badges |
| `--rose` | `#C98B90` | **Assinatura**: botão secundário, badges, linhas, selo do logo |
| `--rose-strong` | `#B97981` | Hover do rosa |
| `--rose-deep` | `#5C3A3F` | Banda de contraste (“Nova Coleção”) |
| `--emerald` | `#1C6B5B` | Pedra (acento) |
| `--paraiba` | `#5FB7A8` | Pedra (brilho/destaque) |
| `--silver` | `#C5CAD0` | Hairlines metálicas / detalhe prata |
| `--line` | `#E9E4E5` | Hairline padrão |
| `--ink` | `#2B2B2D` | Títulos · botão primário |
| `--text` | `#4C4849` | Corpo |
| `--muted` | `#8A8589` | Secundário |

## 4. Tipografia

- **Títulos:** Cormorant Garamond (500/600), inclusive itálico para momentos editoriais.
- **Texto / UI / preço / eyebrow:** Jost (300/400/500). Eyebrow em maiúsculas com
  `letter-spacing` ~0.26em.
- Fallbacks: `Georgia, serif` / `Helvetica Neue, Arial, sans-serif`.
- _(a expandir: escala fluida final por breakpoint, na Fase 2a.)_

## 5. Logo

Selo **rosé** com a flor branca extraída do logo original (`img/druza-mark-white.png`) +
wordmark **Druza** em grafite, com “Semi Joias · Prata” em Jost espaçado. Versões: header
(38px) e footer escuro com logo branco completo (`img/druza-logo-white.png`). _(a expandir:
favicon SVG.)_

## 6. Voz & copywriting

Editorial sóbrio com toque poético sutil. Frases curtas, claras, pouca adjetivação.
Imagens sensoriais (luz, prata, pedra, presença) sem exagero. **Nunca** clichês como
“brilhe como nunca” ou “realce sua beleza”.

**Amostras (fechadas):**
- Hero — título: _Joias que guardam luz._
- Hero — sub: _Prata polida e pedras que acompanham seus dias — do essencial ao inesquecível._
- CTAs: _Ver coleção_ · _Descobrir novidades_ · _Adicionar à sacola_
- Sobre: _A Druza nasceu do gosto por detalhes que duram…_
- Newsletter: _As novas coleções chegam primeiro a você. Sem excessos — só o essencial._

_(a expandir: copy de benefícios, presente, cuidados, microcopy de carrinho/checkout — Fases 2c–2e.)_

## 7. Design system — componentes

Base já no CSS: botões (primário/secundário/ghost), eyebrow, badge “exemplo”, header +
barra de anúncio, hero shell, card, banda de contraste, drawers (sacola/menu), footer.

**Movimento de fundo ambiente (hero):** aurora de `radial-gradient` (rosé · Paraíba · blush)
com deriva lenta (`transform`, 56–76s) + partículas finas em `<canvas>`. **Muito sutil, só no
hero**, atrás do conteúdo. **Sem `filter: blur`** (custo alto de rasterização → usa gradientes
suaves). Respeita `prefers-reduced-motion` (desliga) e pausa quando a aba está oculta ou o
hero sai da viewport.

_(a expandir por fase: cards de produto/coleção/benefício, selos de confiança, galeria +
zoom, sticky buy bar, acordeões, toasts, inputs estilizados, carrinho com barra de frete.)_

## 8. Páginas

- **Home:** anúncio · header · hero · selos · coleções · mais desejados · “Nova Coleção” ·
  sobre · benefícios · presente · prova social · cuidados · newsletter · footer.
- **Produto:** breadcrumb · galeria+zoom · compra (nome, preço/parcelas, tamanho, CTAs,
  selos, frete por CEP, troca, WhatsApp) · sticky buy bar · descrição + ficha técnica ·
  acordeões · complete o look · relacionados · avaliações · FAQ.

## 9. SEO

Títulos/meta por página; URLs amigáveis; `alt` descritivo (já aplicado nas fotos reais);
JSON-LD `Product`/`Offer`/`BreadcrumbList`/`Organization`; Open Graph. Termos-foco: _semi
joias em prata, anel feminino prata, anel com pedra verde, pulseira prata feminina, presente
feminino sofisticado_. _(a implementar: JSON-LD — Fase 2e.)_

## 10. Acessibilidade

Skip-link, foco visível, `prefers-reduced-motion`, `aria` em drawers/acordeões, contraste
AA. Revisão com a skill `web-design-guidelines` ao final de cada fase.

## 11. Performance

`loading="lazy"` + `width/height` nas imagens, JS mínimo, CSS enxuto. _(a fazer: converter
fotos para WebP/AVIF e auto-hospedar fontes.)_

## 12. Próximos passos

Catálogo/preços/fotos reais → plataforma + checkout (Pix/cartão) → otimização de imagens →
analytics → páginas restantes (coleção, sobre, cuidados, trocas, FAQ, contato) → domínio.

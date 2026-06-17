# Design

## Theme

Editorial premium em base branca. Bloom blush radial atrás do hero (transição contínua,
sem seams). Rosa da marca como assinatura contida (selo do logo, botão secundário, badges,
cards). Pedras esmeralda/Paraíba entram pelas fotos das peças. Hairlines em prata/cinza
muito claro. Sombras discretas com toque rosé baixa opacidade. Mobile-first. Sem bege,
sem faixas rosas atravessando a página, sem ouro.

## Color

Paleta atual em **hex** (legado do projeto; migrar para OKLCH é tarefa futura). Branco
domina, rosa assina, pedras em foco. Sempre texto escuro sobre fundo claro.

| Token | Hex | Função |
|---|---|---|
| `--white` | `#FFFFFF` | Base dominante |
| `--white-warm` | `#FDF8F8` | Profundidade sutil entre seções |
| `--blush` | `#FBF0F1` | Bloom do hero, cards contidos, fundos macios |
| `--rose-inst` | `#F4E3E5` | Fundo institucional pontual, badges |
| `--rose` | `#C98B90` | **Assinatura**: selo logo, botão secundário, linhas |
| `--rose-strong` | `#B97981` | Hover do rosa |
| `--rose-deep` | `#5C3A3F` | Contraste forte (texto sobre blush, banda campanha) |
| `--emerald` | `#1C6B5B` | Acento (pedra) — usado em fotos e micro-acentos |
| `--emerald-deep` | `#15564A` | — |
| `--paraiba` | `#5FB7A8` | Brilho/destaque (pedra) |
| `--silver` | `#C5CAD0` | Hairline metálico / detalhe prata |
| `--line` | `#E9E4E5` | Hairline padrão |
| `--ink` | `#2B2B2D` | Títulos · botão primário |
| `--text` | `#4C4849` | Corpo |
| `--muted` | `#6B6669` | Secundário — AA ≥ 4.5:1 sobre branco |

**Contraste:** corpo `--text` sobre `--white` ≈ 8.4:1 ✓. `--muted` sobre `--white` ≈ 5.0:1 ✓ (AA)
— **abaixo de 4.5:1 para corpo** (passa só como large text); usar `--text` para parágrafos
de leitura. Em fundos `--blush`/`--rose-inst`, texto deve ser `--rose-deep`.

## Typography

Pareamento por contraste: serifa display + sans humanista.

- **Display (títulos):** Cormorant Garamond (500/600), itálico em momentos editoriais.
  Fallback: Georgia, "Times New Roman", serif.
- **Texto / UI / preços / eyebrow:** Jost (300/400/500). Fallback: "Helvetica Neue", Arial,
  sans-serif.
- **Eyebrow:** Jost maiúsculas, `letter-spacing` 0.26em. _Voz da marca usa kicker apenas em
  seções de **navegação editorial** (categorias, mundo Druza, newsletter). Não acima de
  toda seção; isso é AI grammar._
- **Hierarquia (clamp):** h1 `clamp(2.4rem, 6vw, 4.2rem)` · h2 `clamp(1.9rem, 4vw, 3rem)` ·
  h3 `clamp(1.3rem, 2.4vw, 1.7rem)`.
- **Letter-spacing display:** 0.005em. Floor seguro (não abaixo de -0.04em).
- **Line-height:** corpo 1.6, títulos 1.08.
- **Wrap:** `text-wrap: balance` aplicado a h1/h2/h3. Considerar `pretty` em parágrafos
  longos.
- **Preço:** `font-variant-numeric: tabular-nums`.

## Spacing & Layout

- Escala 4px múltiplos: `--space-2/3/4/6/8/12/16/24`.
- Container: 1200px (default) / 1040px (narrow).
- Header sticky: `--header-h: 72px`. `[id] { scroll-margin-top: header + 16px }`.
- Grids responsivos com breakpoints: 1col → 2col @680 → 3col @760 → 4col @1000.
- Carrossel mobile com `scroll-snap-type: x mandatory` para categorias.

## Components

- **Botões:** primário tinta `--ink`; secundário ghost rosé `--rose` (borda + texto);
  `--light` (branco sobre imagem); `--ghost-light` (sobre imagem escura).
- **Card de produto:** mídia 4:5 com hover scale(1.05), nome serifado, preço tabular,
  parcelas em `--muted`.
- **Card de categoria:** quadrado 1:1, label sans uppercase com tracking 0.16em.
- **Placeholder `.ph`:** fundo `--white-warm` (ou `--blush` opcional), borda `--line`,
  ícone linear em `--silver`, título display, descrição do asset esperado, selo "foto em
  breve" em pill `--rose-inst` com borda `--rose`. Aspect ratios: 4:5 produto, 1:1
  categoria, 16:9 banner.
- **Banner de campanha (`.campaign`):** full-bleed com foto + scrim escuro + texto branco.
  Único bloco escuro forte da página.
- **Promo `.promo-band__card`:** card contido (max-width 720px) `--blush` + borda `--rose`,
  não atravessa a página.
- **Drawers (menu, sacola):** `role="dialog"`, foco preso, overlay escuro 40%.
- **Selo demo (`.badge-demo`):** pill `--rose-inst` com borda dashed `--rose`, marca
  dados fictícios.

## Motion

- Easing padrão: `cubic-bezier(0.22, 0.61, 0.36, 1)` (ease-out característica).
- **Hero ambient:** três blobs radiais (rosé, Paraíba, blush) com `drift-a/b/c`
  56–76s `infinite alternate`. Custo zero (sem `filter: blur`).
- **Reveal:** `.reveal { opacity: 0; transform: translateY(18px) }` + IntersectionObserver
  toggle `is-visible` (stagger nos editoriais com `transition-delay`).
- **Hover:** imagens com `transform: scale(1.04–1.05)` em 0.7–0.8s; botões `scale(0.98)`
  no `:active`.
- **`prefers-reduced-motion: reduce`:** anima em 0.001ms (essencialmente off).

## Imagery

- 3 fotos reais otimizadas (≤1200px, JPEG q82): `anel-paraiba.jpg`,
  `pulseiras-riviera.jpg`, `anel-coracao.jpg`. ~279KB total (~92% menor que originais).
- Onde falta foto real → placeholder `.ph` premium (sistema explícito).
- **Não usar:** banco de imagem, foto fake, mesma foto repetida muitas vezes.
- Pendente: variantes responsivas (`srcset`/`sizes`), conversão WebP/AVIF, OG image
  dedicada 1200×630.

## Accessibility

WCAG 2.1 AA. Skip-link, foco visível com `--rose` + offset 3px, contraste verificado,
`prefers-reduced-motion`, drawers acessíveis com foco preso, live region na sacola.
Pendência: teste com leitor de tela real em mobile.

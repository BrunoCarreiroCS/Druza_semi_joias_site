# Design

> **Atualização (2026):** referência de produção da home = `index.html` + `js/home.js`
> (direção **"Cinema Editorial"**). Títulos em **Bodoni Moda**, acentos em Cormorant
> itálico, hero cinematográfico com fotografia em movimento, seções com índice numerado.

## Theme

Editorial premium com **duas zonas de temperatura**: hero escuro cinematográfico no topo
(foto da peça em movimento + scrim + vinheta + grão de filme sutil) → corpo em **base
branca** com muito respiro. Rosa da marca como assinatura contida (selo do logo, índices,
fios, botão secundário, CTA de card). Pedras esmeralda/Paraíba entram pelas fotos e como
acento nos itálicos. Hairlines em cinza claro. Sombras discretas com toque rosé. Mobile-first.
Sem bege, sem ouro, **sem tickers/marquees**, sem wordmark gigante decorativo.

## Color

Paleta em **hex** (migrar para OKLCH é tarefa futura). Branco domina o corpo; escuro
(`--night #151113`) só no hero e na campanha; rosa assina; pedras em foco.

| Token | Hex | Função |
|---|---|---|
| `--white` | `#FFFFFF` | Base dominante do corpo |
| `--white-warm` | `#FDF8F8` | Fundo de mídia / profundidade sutil |
| `--blush` | `#FBF0F1` | Newsletter, fundos macios |
| `--rose-inst` | `#F4E3E5` | Placeholder, badges |
| `--rose` | `#C98B90` | **Assinatura**: selo logo, índice, fios, botão secundário |
| `--rose-strong` | `#B97981` | Hover do rosa · eyebrow · CTA de card |
| `--rose-deep` | `#5C3A3F` | Banda de anúncio · texto sobre blush |
| `--emerald` | `#1C6B5B` | Acento (pedra) |
| `--paraiba` | `#5FB7A8` | Brilho/destaque (pedra) · itálico no escuro |
| `--silver` | `#C5CAD0` | Hairline metálico / ícone placeholder |
| `--line` | `#E9E4E5` | Hairline padrão |
| `--night` | `#151113` | Hero e footer |
| `--ink` | `#2B2B2D` | Títulos · botão primário |
| `--text` | `#4C4849` | Corpo |
| `--muted` | `#6B6669` | Secundário |

**Contraste:** corpo `--text` sobre `--white` ≈ 8.4:1 ✓. `--muted` sobre `--white` ≈ 5.0:1
(usar em rótulos/large text, não em parágrafo de leitura). Sobre `--blush`/`--rose-inst`,
texto `--rose-deep`. Sobre hero/imagem escura, branco garantido pelo scrim.

## Typography

Três vozes por contraste (ver `DIRECAO-DE-ARTE.md §4`):

- **Display (títulos):** **Bodoni Moda** (500/600). `--display`. Letter-spacing −.01/−.02em.
  Line-height **1.02–1.06** (mais folga que o Cormorant). Fallback: Cormorant, Georgia, serif.
- **Acento (`.acc`):** Cormorant Garamond **itálico** (500), 1–2 palavras por título e em
  citações. Fallback Georgia italic.
- **Texto / UI / preço / eyebrow / índice:** Jost (300/400/500). `--sans`.
- **Eyebrow / índice:** Jost maiúsculas, tracking 0.22–0.28em. Índice numerado por seção
  (`.sindex`: número rosé + fio + eyebrow) — **é a gramática de navegação da marca**, não um
  kicker em toda seção.
- **Hierarquia (clamp):** h1 `clamp(2.8rem, 6vw, 5.4rem)` · h2 `clamp(1.9rem, 4vw, 3.1rem)` ·
  h3 `clamp(1.2rem, 2.2vw, 1.35rem)`.
- **Wrap:** `text-wrap: balance` em h1–h3; `pretty` em parágrafos.
- **Preço:** `font-variant-numeric: tabular-nums`.

## Spacing & Layout

- Container: **1312px** (home wide, para respiro nas grades de 4) / 1200px padrão / 920px
  (texto/manifesto).
- Seções `.block`: `padding: 84px 56px` (desktop) → `56px 24px` (mobile).
- Hero: altura fixa 820px desktop / 640px mobile; conteúdo ancorado no rodapé do hero.
- Grids: `.grid-4` (categorias) → 2col @1000; `.grid-3` (produtos/editorial) → 1col @1000.
- `[id] { scroll-margin-top }` para âncoras sob header.

## Components

- **Botões (`.btn`):** primário `--ink`; `--light` (branco sobre imagem); `--ghost-light`
  (borda branca sobre imagem escura); `--ghost-rose` (ghost rosé no claro). `scale(.98)` no
  `:active`.
- **Índice de seção (`.sindex`):** `01` em Jost rosé tabular + fio 28px + eyebrow. Substitui
  o número itálico gigante da versão anterior.
- **Card de produto (`.card--lift`):** mídia 4:5, hover `translateY(-6px)` + imagem
  `scale(1.06)`, nome em `--display` 500, preço tabular, parcelas em `--muted`.
- **Card de categoria:** mídia 1:1 + **rodapé `.cat-foot`** = nome em `--display` +
  descritor curto (uppercase, `--muted`) + CTA `Explorar → / Avise-me →`. Fio superior
  `--line`. (Evolução do label centralizado uppercase.)
- **Placeholder (`.ph`):** fundo `--blush`, borda `--rose-inst`, ícone linear `--silver`,
  "Foto em breve" em serifa, pill "placeholder" `--rose`. Para brincos, o descritor orienta:
  "Em breve · lista de espera".
- **Campanha:** full-bleed foto + scrim lateral escuro + texto branco + índice `03`. Único
  bloco escuro forte do corpo.
- **Manifesto:** citação centralizada grande em Bodoni itálico + aspas rosé + rótulo
  "Manifesto Druza". Dá alma sem depoimento falso.
- **Footer (`.foot`):** fundo `--night`; **logo branca centralizada** na 1ª célula; 3 colunas
  de links; **linha de copyright discreta** (`.foot__legal`, sem wordmark gigante).

## Motion

- Easing padrão: `cubic-bezier(0.22, 0.61, 0.36, 1)`.
- **Hero:** crossfade `opacity 1.2s` entre slides + `drz-ken` (scale 1→1.14, ~9–16s
  alternate). Legenda "Em destaque" e contador atualizam por slide; dots navegáveis. Pausa
  quando a aba está oculta.
- **Entrada do hero:** `drz-fadeup` escalonado (eyebrow .1s → título .26s → sub .42s →
  CTAs .56s → destaque .7s).
- **Reveal:** `.reveal` → `.is-visible` (IntersectionObserver, threshold .14).
- **Hover:** imagens `scale(1.06)` 0.85s; cards `translateY(-6px)` 0.55s.
- **`prefers-reduced-motion: reduce`:** slideshow parado no 1º slide, sem Ken Burns, reveal e
  entradas visíveis sem animação, `scroll-behavior: auto`.

## Imagery

- 3 fotos reais WebP: `anel-paraiba.webp`, `pulseiras-riviera.webp`, `anel-coracao.webp`
  (versões `.jpg` mantidas como fallback).
- Logo footer: `img/druza-logo-white.png` (flor branca sobre transparência).
- Onde falta foto real → placeholder `.ph` premium (brincos).
- **Não usar:** banco de imagem genérico, foto fake, repetição óbvia da mesma foto lado a
  lado sem função.
- Pendente: `srcset`/`sizes`, OG image 1200×630, **fotografia real dos brincos**, e (opcional)
  **vídeo curto da marca** para o hero no lugar do slideshow.

## Usabilidade (heurísticas aplicadas)

- **Orientação constante:** índices numerados dão senso de progressão; cada card de
  categoria diz o que há dentro (descritor) e o próximo passo (CTA), sem poluir.
- **Hierarquia de ação clara:** 1 CTA primário por bloco (`--ink`/`--light`), secundário em
  ghost. Nunca dois primários competindo.
- **Feedback:** hover eleva o card e dá zoom na imagem; `:active` afunda o botão; dots do
  hero mostram posição (`01 / 03`).
- **Navegação:** header fixo transparente sobre o hero; âncoras internas (`#categorias`) e
  links reais para `catalogo.html`, `brincos.html`, `produtos/*`, `sobre.html`, etc.
- **Honestido:** placeholder e "lista de espera" comunicam o que ainda não existe, em vez de
  esconder — mantém confiança.
- **Carga cognitiva baixa:** máx. 1–2 blocos escuros; muito branco; sem banners empilhados.

## Accessibility

WCAG 2.1 AA. Foco visível, contraste verificado, `prefers-reduced-motion`, nav por teclado,
`aria-label` em ícones do header e dots do hero, `<label>` (oculto) no input de e-mail,
imagens decorativas com `alt=""` e informativas com `alt` descritivo. Pendência: teste com
leitor de tela em mobile; skip-link.

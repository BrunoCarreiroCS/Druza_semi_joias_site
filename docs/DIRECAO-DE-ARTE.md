# Druza Semi Joias — Direção de Arte & Design System

Guia para designer/dev executar o site. Decisões **fechadas** estão marcadas; itens a
detalhar aparecem como _(a expandir)_.

> **Atualização (2026):** o design principal da home passou a ser a direção **"Cinema
> Editorial"** — hero **full-bleed** com fotografia da peça em movimento (slideshow /
> vídeo da marca), tipografia de **alta-costura (Bodoni Moda)** nos títulos e um sistema de
> **índices editoriais numerados** por seção. Referência de produção: `index.html` +
> `js/home.js`. Esta é a evolução do conceito "vitrine-joia editorial" — não o abandono
> dele: a base branca, o rosé de assinatura e a peça como protagonista permanecem.

---

## 1. Posicionamento

Marca feminina de semi joias em **prata**, sofisticada, delicada e contemporânea. Combina
**brilho, elegância e presença**. Foco no detalhe das peças e no contraste entre prata e
**pedras verdes** (esmeralda / Paraíba). Comunicação premium, acessível e confiável.

**Primeiros 5 segundos:** um hero cinematográfico — foto real da joia ocupando a tela, luz,
tipografia editorial de contraste alto — sensação de marca estabelecida, não de loja
genérica. Do hero para baixo, o corpo volta ao **branco dominante** com muito respiro.

**Evitar:** excesso de rosa · aparência infantil/"fofa" · bege/marfim dominante · luxo
pesado/brega · layout genérico de e-commerce · poluição de banners · animações pesadas ·
tickers/marquees decorativos · números e selos inventados.

## 2. Conceito — "Cinema Editorial"

Duas zonas de temperatura, com transição clara:

1. **Hero escuro cinematográfico** (topo): fotografia da peça em movimento sutil (crossfade
   entre fotos com leve *Ken Burns*, ou vídeo curto da marca), scrim + **vinheta** e **grão
   de filme** discretos para profundidade. Nav transparente sobre a imagem. Conteúdo entra
   em **cascata encenada** (eyebrow → título → sub → CTAs).
2. **Corpo claro editorial**: base branca, seções organizadas por **índice numerado**
   (`01 — COLEÇÕES`, `02 — SELEÇÃO DA CASA`…), imagens grandes, muito espaço em branco.

**Regra de marca:** o logo (flor) vive **no header** (discreto, branco sobre o hero) e no
**footer** (versão branca transparente, centralizada). A peça (prata + pedras verdes) é a
protagonista visual. O **verde** é só detalhe das pedras, **nunca** logo ou símbolo.
**Sem wordmark gigante decorativo** no footer — no lugar, uma linha de copyright discreta.

## 3. Paleta (tokens)

| Token | Hex | Uso |
|---|---|---|
| `--white` | `#FFFFFF` | Base dominante do corpo |
| `--white-warm` | `#FDF8F8` | Fundo de mídia / profundidade sutil |
| `--blush` | `#FBF0F1` | Seção institucional macia (newsletter) |
| `--rose-inst` | `#F4E3E5` | Fundo de placeholder / badges |
| `--rose` | `#C98B90` | **Assinatura**: selo do logo, índice, fios, botão secundário |
| `--rose-strong` | `#B97981` | Hover do rosa · eyebrow · CTA de card |
| `--rose-deep` | `#5C3A3F` | Banda de anúncio · texto sobre blush |
| `--emerald` | `#1C6B5B` | Pedra (acento) |
| `--paraiba` | `#5FB7A8` | Pedra (brilho/destaque) · acentos itálicos no escuro |
| `--silver` | `#C5CAD0` | Hairlines metálicas / ícone de placeholder |
| `--line` | `#E9E4E5` | Hairline padrão |
| `--night` | `#151113` | Fundo do hero e do footer |
| `--ink` | `#2B2B2D` | Títulos · botão primário |
| `--text` | `#4C4849` | Corpo |
| `--muted` | `#6B6669` | Secundário (AA em large text) |

Máx. **1–2 blocos escuros** por página (hero + campanha). Corpo sempre texto escuro sobre
claro; sobre imagem escura, texto branco com scrim garantindo contraste AA.

## 4. Tipografia

Pareamento de três vozes por contraste — **é a principal fonte de personalidade da marca**:

- **Display / títulos:** **Bodoni Moda** (500/600) — serifada de alta-costura, contraste
  alto (linguagem de moda/joalheria). `letter-spacing` levemente negativo (−.01 a −.02em) em
  títulos grandes. Fallback: `Cormorant Garamond, Georgia, serif`.
- **Acento editorial:** **Cormorant Garamond itálico** (500) — usado **só** em 1–2 palavras-
  chave dentro do título (*luz.*, *permanece*, *ficam*) e em citações. Cria o contraste
  couture com o Bodoni. Classe utilitária: `.acc`.
- **Texto / UI / preço / eyebrow / índice:** **Jost** (300/400/500). Eyebrow e índices em
  maiúsculas com `letter-spacing` ~0.22–0.28em. Preço com `font-variant-numeric: tabular-nums`.
- **Line-height:** corpo 1.6; títulos 1.02–1.06 (o Bodoni precisa de um respiro maior que o
  Cormorant — não usar abaixo de 1.0).
- **Wrap:** `text-wrap: balance` em títulos; `pretty` em parágrafos longos.
- **Hierarquia (clamp sugerido):** h1 `clamp(2.8rem, 6vw, 5.4rem)` · h2 `clamp(1.9rem, 4vw,
  3.1rem)` · h3 `clamp(1.2rem, 2.2vw, 1.35rem)`.

## 5. Logo

Flor de lótus (recriada em SVG). Versões:
- **Header:** SVG selo rosé + wordmark "Druza / Semi Joias · Prata" em branco sobre o hero.
- **Footer:** `img/druza-logo-white.png` — flor **branca sobre transparência**, ~82px,
  **centralizada verticalmente** na célula do footer.

O verde nunca entra no logo. _(a expandir: favicon SVG, versão para fundo claro.)_

## 6. Voz & copywriting

Editorial sóbrio com toque poético sutil. Frases curtas, claras, pouca adjetivação.
Imagens sensoriais (luz, prata, pedra, presença) sem exagero. **Nunca** clichês como
"brilhe como nunca". **Informação precisa que orienta, sem poluir** — descritores curtos que
intrigam e dizem o que há dentro, em vez de números inventados.

**Amostras (fechadas):**
- Hero — título: _Joias que guardam **luz.**_
- Hero — sub: _Prata polida, pedras verdes e detalhes feitos para acompanhar seus dias — do
  essencial ao inesquecível._
- Índice destaque (hero): _Em destaque · Anel Paraíba_ (atualiza com o slide).
- Categorias (descritor): _Solitários & pedras verdes_ · _Riviera em prata 925_ ·
  _Em breve · lista de espera_ · _Prontos para presentear_. CTA de card: _Explorar →_ /
  _Avise-me →_.
- Campanha: _Verde que **permanece**._
- Mundo Druza: _Detalhes que **ficam**._
- Manifesto: _Uma joia não se usa apenas — se guarda…_
- Newsletter: _As novas coleções chegam primeiro a você. Sem excessos — só o essencial._
- CTAs: _Ver coleção_ · _Descobrir novidades_ · _Comprar agora_ · _Adicionar à sacola_.

## 7. Design system — componentes

Base em `index.html` (classes no `<head>`): botões (`.btn` + `--ink`/`--light`/
`--ghost-light`/`--ghost-rose`), `.eyebrow`, `.acc`, índice de seção (`.sindex`), cards
(`.card--lift`, `.card-media`), rótulo de categoria (`.cat-foot`), placeholder (`.ph`),
hero (`.hero`), footer (`.foot`), `.reveal`.

**Movimento (fechado):**
- **Hero:** crossfade entre fotos (`opacity` 1.2s) + *Ken Burns* lento (`drz-ken`, scale
  1→1.14). Sem `filter: blur`. Alternativa: vídeo da marca no lugar das fotos (mesmo scrim +
  vinheta + grão).
- **Entrada:** cascata `drz-fadeup` com `animation-delay` escalonado no hero.
- **Reveal:** `.reveal { opacity:0; translateY(32px) }` → `.is-visible` via
  IntersectionObserver (`js/home.js`).
- **Hover:** imagem `scale(1.06)` em 0.85s; card `translateY(-6px)`; botão `scale(.98)` no
  `:active`.
- **Easing padrão:** `cubic-bezier(.22,.61,.36,1)`.
- **`prefers-reduced-motion: reduce`:** desliga slideshow, reveal e Ken Burns (tudo visível).

## 8. Páginas

- **Home:** anúncio · hero (slideshow/vídeo, nav transparente) · `01` coleções ·
  `02` favoritas · `03` campanha (bloco escuro) · `04` mundo Druza (split) · manifesto ·
  newsletter · footer (logo branca + copyright). Ref.: `index.html`.
- **Produto:** breadcrumb · galeria+zoom · compra (nome, preço/parcelas, tamanho, CTAs,
  selos, frete por CEP, troca, WhatsApp) · sticky buy bar · descrição + ficha técnica ·
  relacionados. _(aplicar a mesma tipografia Bodoni + índices onde couber.)_

## 9. SEO

Título/meta por página; URLs amigáveis; `alt` descritivo; JSON-LD
`Product`/`Offer`/`BreadcrumbList`/`Organization`; Open Graph. _(implementar JSON-LD.)_

## 10. Acessibilidade

Ver `DESIGN.md → Accessibility`. Foco visível, `prefers-reduced-motion`, contraste AA, nav
por teclado, labels em inputs, dots do hero com `aria-label`.

## 11. Performance

`loading="lazy"` + `width/height` nas imagens abaixo da dobra, JS mínimo (`home.js` sem
dependências), CSS enxuto. Fontes auto-hospedadas (Cormorant/Jost) + Bodoni via Google
Fonts com `preconnect`. _(a fazer: WebP/AVIF já em uso; gerar `srcset`.)_

## 12. Próximos passos

Estender a linguagem Bodoni + índices para produto e catálogo → substituir o slideshow por
vídeo real da marca no hero → fotografia real dos brincos (maior lacuna) → JSON-LD →
otimização de imagens responsivas.

# Auditoria técnica mobile — linha de base

## Saúde da interface

| Dimensão | Nota | Principal achado |
| --- | ---: | --- |
| Acessibilidade | 3/4 | Alguns alvos de toque têm menos de 44 px |
| Performance | 3/4 | Parte das imagens não declara dimensões intrínsecas no HTML |
| Responsividade | 3/4 | Toast cobre CTA do carrinho; sticky buy comprime o nome |
| Theming | 4/4 | Tokens e contraste preservados |
| Antipadrões | 4/4 | Direção visual própria e consistente |
| **Total** | **17/20** | **Bom** |

## Veredito de antipadrões

Passa. A direção Cinema Editorial é reconhecível, usa fotografia real, tokens próprios e hierarquia consistente. Os índices numerados são parte documentada da linguagem da marca, não um padrão genérico introduzido nesta tarefa.

## Resumo executivo

- 46 renderizações concluídas em iPhone 13/14 e Samsung Galaxy S23/S24.
- Nenhum asset local quebrado, erro JavaScript fatal, scroll horizontal ou texto visível cortado.
- 2 problemas P1, 3 padrões P2 e 1 oportunidade P3 confirmados.

## Achados

### P1 — toast cobre o CTA do carrinho

- **Local:** `css/druza.css`, `.toast`; `js/druza.js`, `addToCart`.
- **Impacto:** durante 2,2 segundos, o aviso “Adicionado à sacola” fica exatamente sobre “Finalizar compra”.
- **Correção:** remover o toast redundante quando o drawer já é aberto como confirmação.
- **Comando:** `$impeccable adapt`.

### P1 — sticky buy comprime o nome do produto

- **Local:** `css/druza.css`, `.stickybuy__in` em até 640 px.
- **Impacto:** o nome quebra em várias linhas numa coluna estreita e invade visualmente a barra fixa.
- **Correção:** ocultar os metadados no telefone e priorizar miniatura + CTA.
- **Comando:** `$impeccable adapt`.

### P2 — controles abaixo de 44 px

- **Local:** `css/druza.css`, header, fechamento de menu/drawer, dots do hero, chips e select; `css/account.css`, `.pw-toggle`.
- **Impacto:** menor precisão de toque em iPhone e Samsung.
- **Correção:** ampliar a caixa de interação mantendo o desenho visual.
- **Padrão:** WCAG 2.5.8 e diretrizes de interação mobile.
- **Comando:** `$impeccable adapt`.

### P2 — drawer e barra fixa sem safe-area inferior explícita

- **Local:** `css/druza.css`, `.drawer`, `.drawer__foot`, `.stickybuy__in`.
- **Impacto:** o CTA pode ficar próximo demais do indicador de início em iPhones.
- **Correção:** usar `100dvh` e `env(safe-area-inset-bottom)`.
- **Comando:** `$impeccable adapt`.

### P2 — detectores precisam ignorar conteúdo somente para leitores de tela

- **Local:** automação da auditoria.
- **Impacto:** `.sr-only` aparece como texto cortado, embora seja uma técnica acessível correta.
- **Correção:** excluir `.sr-only` da regra de truncamento para evitar falso positivo.
- **Comando:** `$impeccable audit`.

### P3 — dimensões intrínsecas incompletas

- **Local:** imagens de cards, hero e footer em páginas públicas.
- **Impacto:** risco residual de CLS; a maioria já está protegida por contêineres com proporção fixa.
- **Correção:** adicionar dimensões quando o elemento não estiver protegido por uma caixa de proporção.
- **Comando:** `$impeccable optimize`.

## Pontos positivos

- Todas as imagens carregaram e conservaram proporção visual.
- Não houve overflow horizontal em nenhuma das 46 renderizações.
- Títulos, preços, formulários e accordions permaneceram legíveis.
- Drawers bloquearam o scroll do fundo e ficaram dentro do viewport.
- `prefers-reduced-motion` funcionou durante os testes.

## Ações recomendadas

1. **P1/P2 — `$impeccable adapt`:** corrigir toast, sticky buy, alvos de toque e safe areas.
2. **P3 — `$impeccable polish`:** executar a regressão visual e eliminar falsos positivos do relatório.

# Auditoria de UX — Painel Administrativo Druza

Avaliação de usabilidade, navegação e experiência do painel administrativo
(`admin.html`, `js/admin-panel.js`, `js/admin-help.js`, `css/admin.css`),
feita com o método do Nielsen (10 heurísticas), checagem automática de
padrões de "cara de IA" e teste por perfil de usuária. Metodologia e
critérios completos no rodapé.

**Não é uma lista de bugs.** É uma leitura de o que funciona, o que
atrapalha e o que vale priorizar — nenhuma linha de código foi alterada
para produzir este documento.

---

## Nota de contexto

Este painel foi construído numa única leva de trabalho (produtos,
estoque, categorias, pedidos, clientes, envios, histórico e a camada de
ajuda) — o que explica por que o sistema de ajuda contextual é
excepcionalmente forte (foi desenhado desde o início pensando numa
usuária sem experiência técnica) enquanto outras dimensões, como ações em
lote, não acompanharam o mesmo cuidado.

---

## Nota de metodologia

Duas verificações independentes foram feitas: uma leitura de design
(hierarquia, consistência, arquitetura de informação, heurísticas) e uma
varredura automática por padrões conhecidos de "IA genérica"
(`detect.mjs`, da skill Impeccable). A varredura automática dentro do
navegador (que gera um overlay visual) **travou por um bug na própria
ferramenta** (`TypeError: elId.startsWith is not a function`, dentro de
`collectBrowserFindings`) — provavelmente por causa dos vários ícones SVG
inline do painel. A injeção do script funcionou; o scan em si não
terminou. Por isso as evidências abaixo vêm de: leitura de código,
inspeção do DOM renderizado (com dados de teste, sem tocar em conta real)
e cálculo exato de contraste de cor — não de captura de tela (a
ferramenta de screenshot também não respondeu neste ambiente).

---

## Nota sobre a captura de contexto do produto

O `PRODUCT.md` do projeto está registrado como `register: brand`
(vitrine/loja). O painel administrativo, no entanto, é claramente um
**painel de ferramenta interna** (quem usa está numa tarefa, não sendo
seduzida por uma marca) — por isso esta auditoria usa os critérios de
**produto/dashboard**, não os de página de marca. Concretamente: tipografia
de UI deve ser enxuta e utilitária, cor deve ser restrita a
estado/ação, e familiaridade pesa mais que personalidade.

---

## Placar de saúde do design

| # | Heurística | Nota | Achado principal |
|---|---|:-:|---|
| 1 | Visibilidade do status do sistema | 3 | Toast confirma cada ação e "Carregando…" aparece nas buscas, mas o formulário de produto (6 seções) não mostra progresso nem indicador de "faltam X campos" |
| 2 | Aproximação com o mundo real | **4** | Ponto mais forte do painel: zero jargão técnico, tudo em português claro ("Fora da loja" em vez de "inactive") |
| 3 | Controle e liberdade da usuária | 2 | Cancelar/Voltar existem no formulário, mas não há "desfazer" para movimentação de estoque errada nem para os `prompt()` do remetente |
| 4 | Consistência e padrões | 2 | Componentes próprios são consistentes entre si, mas 10 ações usam caixas nativas do navegador (`confirm`/`prompt`) em vez do próprio sistema de modal já existente |
| 5 | Prevenção de erros | 3 | Estoque e pagamento são bem protegidos no banco; o formulário de produto (longo) não salva rascunho — atualizar a página por engano perde tudo |
| 6 | Reconhecimento em vez de memorização | **4** | O campo de busca de produto (que substituiu a lista rolável) e os badges de situação eliminam quase toda necessidade de lembrar algo |
| 7 | Flexibilidade e eficiência de uso | **1** | Nenhuma ação em lote em lugar nenhum do painel, e uma tela **perdeu** uma que já tinha (ver Achado P2 abaixo) |
| 8 | Estética e design minimalista | 3 | Visual limpo e comedido (acertadamente, para um painel — nada de floreio de marca); o único ruído visual são os pop-ups nativos do navegador |
| 9 | Ajudar a reconhecer e corrigir erros | **4** | Mensagens de erro específicas e em português ("Não há estoque suficiente para concluir essa saída"), quase nunca um código técnico cru |
| 10 | Ajuda e documentação | **4** | Sistema de tutorial por seção + 36 ícones de ajuda contextual + botão "Ajuda" que reabre o que foi dispensado — construído sob medida para o público real |
| **Total** | | **30/40** | **Bom** — base sólida, com pontos fracos concentrados em consistência e eficiência |

> Faixa 28–35 = "Bom": trate os pontos fracos, a fundação já é sólida.

---

## Veredito: tem cara de IA?

**Não.** O painel evita todos os clichês visuais comuns (sem gradiente em
texto, sem cartões idênticos em fileira, sem "eyebrow" em toda seção, sem
glassmorphism, sem métrica-gigante-com-gradiente). A paleta é
deliberadamente restrita, como um painel deve ser.

**Um desvio real, encontrado na varredura automática e confirmado no
código:** o ícone de ajuda (i) e o título dos cartões de tutorial usam a
fonte serifada de exibição da marca (Cormorant), quando o padrão para UI
de produto é usar só a fonte utilitária (Jost) em rótulos, botões e
dados. É pequeno e fácil de ajustar — trocar a letra "i" para Jost em
peso médio, mantendo o círculo rosé como assinatura visual.

**Varredura automática (determinística):**
- 5 travessões (—) no texto do painel — a maioria em rótulos curtos de
  `<select>` ("À venda — aparece na loja"). Baixa severidade, fácil de
  trocar por dois pontos se quiser.
- Uso de `font-family: Arial` sinalizado como "fonte batida" em
  `js/admin-panel.js:913` — **falso positivo**: é o estilo da página de
  impressão de etiqueta de envio, não da tela do painel. Arial ali é a
  escolha certa (compatibilidade universal em impressoras).

---

## Visão geral

O painel entrega o que promete: uma pessoa sem conhecimento técnico
consegue cadastrar produto, dar entrada em estoque e despachar um pedido
sem ajuda externa — o sistema de tutoriais garante isso. A maior
oportunidade não é tornar o painel mais bonito; é **fechar a distância
entre os componentes visuais próprios (muito bem cuidados) e os
momentos em que o painel recorre a caixas de diálogo cruas do
navegador**, que quebram a confiança bem no meio de tarefas importantes
(configurar o remetente, excluir uma categoria).

---

## O que já funciona bem

**1. A camada de ajuda é genuinamente rara de se ver num painel deste
porte.** Tutorial por seção, ícone (i) em 36 pontos diferentes, e um
botão que reabre o que foi dispensado — a maioria das ferramentas
comerciais não vai tão longe. Isso resolve de verdade os dois problemas
mais comuns de painel administrativo: "o que esse campo faz?" e "por
onde eu começo?".

**2. Nada é destruído de verdade.** Produto, categoria e pedido nunca são
apagados — só "tirado da loja" ou "arquivado". Isso é uma decisão de
prevenção de erro rara de ver bem executada, e a mensagem que explica o
porquê ("Este produto já foi vendido, então...") transforma uma restrição
técnica em algo que a usuária entende e confia.

**3. Mensagens de erro que ensinam, não só avisam.** "Não há estoque
suficiente para concluir essa saída" ou "Esta categoria tem 3 produtos —
escolha para onde movê-los antes de excluir" são exatamente o tipo de
frase que faz alguém sem conhecimento técnico continuar confiante em vez
de travar.

---

## Problemas prioritários

### 🔴 P1 — Caixas de diálogo nativas do navegador quebram a experiência em 10 pontos diferentes

**Por que importa:** o painel tem um sistema de modal próprio, bem
desenhado (usado no detalhe do pedido) — mas para configurar o
remetente de envio, o fluxo é **três `prompt()` sequenciais do sistema
operacional** (nome → depois documento → depois endereço), sem
formulário único, sem validação, e se a usuária clicar "Cancelar" em
qualquer um dos três, perde os anteriores. Excluir uma categoria com
produtos dentro pede que a usuária **leia uma lista numerada e digite o
número** da categoria de destino numa caixa de texto — o mesmo painel já
tem um campo de busca por nome pronto (o de produtos, no Estoque) que
resolveria isso de forma muito mais natural.

Para uma pessoa que não é técnica, uma caixa cinza do sistema
operacional no meio de uma tela cuidadosamente desenhada em rosé e
branco passa a sensação de que "alguma coisa quebrou" — é o oposto do
que o resto do painel constrói.

**Onde:** `js/admin-panel.js`, 6 usos de `window.confirm()` e 4 de
`window.prompt()` (linhas 751, 763, 808, 810, 812, 1266, 1269, 1309,
1506, 1515, 1740).

**Correção:** trocar por modais no próprio estilo do painel (reaproveitar
o padrão de `.admin-modal` já usado no detalhe do pedido) — um formulário
único para o remetente, e o campo de busca já existente para escolher a
categoria de destino.

**Comando sugerido:** `$impeccable polish`

---

### 🔴 P1 — O ícone de ajuda (i) não passa no contraste mínimo de acessibilidade

**Por que importa:** medi o contraste de cor exato (não é estimativa):
o texto do ícone usa `--rose-strong` (`#B97981`) sobre fundo branco, no
tamanho `0.72rem` — o resultado é **3,43:1**. O mínimo exigido pelo WCAG
AA para texto deste tamanho é **4,5:1**. Esse ícone aparece em **36
lugares** no painel — é literalmente o elemento mais repetido da
interface depois dos botões.

**Correção:** trocar a cor do texto do ícone para `--rose-deep`
(`#5C3A3F`), que mede 9,85:1 sobre branco — sobra folga, e mantém a
identidade rosé no círculo ao redor.

**Comando sugerido:** `$impeccable polish`

---

### 🟡 P2 — Nenhuma ação em lote existe hoje, e uma tela **perdeu** a que já tinha

**Por que importa:** conferindo o código anterior deste mesmo painel,
a tela de Pedidos já teve edição em lote — cada linha marcava
"alterada" ao mexer no status ou rastreio, e um botão único
("Salvar todas as alterações") aplicava tudo de uma vez. A reconstrução
do painel trocou isso por "abra o pedido, mude, salve, feche, repita" —
um pedido de cada vez. Nem Produtos nem Categorias nunca tiveram ação em
lote: arquivar 3 produtos hoje exige 3 confirmações separadas.

Numa segunda-feira com 15 pedidos para despachar, isso é a diferença
entre alguns segundos e vários minutos repetindo o mesmo clique.

**Correção:** reintroduzir seleção múltipla (caixas de marcação + barra
de ação) pelo menos em Pedidos (marcar N como enviados) e Produtos
(ativar/arquivar N de uma vez).

**Comando sugerido:** `$impeccable shape` (para desenhar o fluxo antes de
construir)

---

### 🟡 P2 — O formulário de produto (6 seções) não salva rascunho

**Por que importa:** é o formulário mais longo do painel. Se a página
recarregar sem querer, a conexão cair, ou a usuária navegar para outra
aba no meio do preenchimento, **tudo é perdido** — sem aviso, sem
recuperação.

**Correção:** salvar o rascunho no navegador (localStorage) a cada poucos
segundos, e oferecer para restaurar ao reabrir o formulário.

**Comando sugerido:** `$impeccable harden`

---

### 🟢 P3 — Estados de carregamento são só texto, sem esqueleto visual

**Por que importa:** "Carregando…" em texto simples funciona, mas não dá
nenhuma pista do formato que está vindo — um esqueleto visual (blocos
cinza no formato da tabela/cartão final) deixa a espera menos incerta.
Impacto real baixo, dado que o painel roda numa conexão local/rápida na
maior parte do tempo.

**Comando sugerido:** `$impeccable polish`

---

## Alertas por perfil de usuária

**Alex (usuária avançada, no jargão do método)** — quem usa o painel todo
dia e busca velocidade:
- Nenhum atalho de teclado além de Enter nas buscas e Esc para fechar
  (o campo de busca de produto no Estoque tem navegação por setas, mas é
  o único lugar).
- Sem ação em lote em lugar nenhum (ver P2 acima).
- Os três `prompt()` seguidos do remetente são exatamente o tipo de
  interrupção que mais frustra quem já sabe o que está fazendo.

**Sam (depende de leitor de tela / teclado)**:
- O contraste do ícone (i) falha o mínimo de acessibilidade (ver P1
  acima) — isso afeta diretamente quem tem baixa visão, não só quem usa
  leitor de tela.
- O formulário de produto, com 6 seções, não anuncia progresso
  (\"seção 3 de 6\") para quem navega por teclado/leitor de tela.

**A usuária real declarada deste painel** (mãe do dono do site, sem
experiência técnica prévia):
- É exatamente para ela que o sistema de tutoriais e ícones de ajuda foi
  desenhado — e funciona. Este é o ponto mais forte do painel hoje.
- Os `prompt()` sequenciais do remetente são o tipo de interação que
  **mais** vai assustar esse perfil específico: três caixas cinzas do
  sistema, sem a cara do site, no meio de uma tarefa que ela já
  aprendeu a fazer em todo o resto pela tela.
- A ausência de ação em lote não é um problema para ela hoje (poucos
  pedidos por vez, loja começando) — mas vai se tornar um conforme a
  loja crescer.

---

## Observações menores

- Cinco travessões no texto do painel poderiam virar dois-pontos, mais
  próximo da convenção de rótulo de formulário do que de prosa.
- O texto de ajuda do ícone (i) usa a fonte de exibição da marca
  (Cormorant itálico) — painéis de produto normalmente usam só a fonte
  utilitária; considerar trocar por Jost em peso médio.
- Não há indicador visual de progresso no formulário de produto (6
  seções) além da rolagem — um índice lateral fixo ("Você está na seção
  3 de 6") ajudaria em telas menores.

---

## Perguntas para pensar

- O painel hoje trata "poucos pedidos, um de cada vez" como o caso comum.
  Quando a loja crescer, isso ainda vai ser verdade?
- Os `prompt()` do remetente existem porque é uma configuração rara
  (uma vez só). Vale a pena um modal completo para algo raro, ou um
  formulário mais simples resolveria?
- O painel tem exatamente uma usuária real hoje. Vale desenhar para
  "Alex" (atalhos, lote) agora, ou esperar a loja crescer o suficiente
  para isso importar?

---

## Notas de execução (metodologia completa)

- **Alvo:** `admin.html` (+ `js/admin-panel.js`, `css/admin.css`)
- **Lista de exceções:** nenhuma (`.impeccable/critique/ignore.md` não
  existe ainda)
- **Independência das avaliações:** degradada — as duas avaliações
  (revisão de design e varredura automática) foram feitas em sequência
  pelo mesmo agente, sem sub-agentes isolados, por política desta sessão
  de não acionar sub-agentes sem pedido explícito.
- **Varredura automática (CLI):** executada com sucesso —
  `detect.mjs --json admin.html js/admin-panel.js` — 2 achados (acima).
- **Overlay visual no navegador:** injeção do script confirmada (título
  da aba alterado com sucesso), mas o scan interno travou com
  `TypeError: elId.startsWith is not a function` — sem achados visuais
  disponíveis por essa via. Servidor temporário (`live-server.mjs`,
  porta 8400) parado ao final.
- **Captura de tela:** indisponível neste ambiente (a ferramenta não
  respondeu); substituída por inspeção do DOM renderizado com dados de
  teste e cálculo exato de contraste de cor via fórmula WCAG.

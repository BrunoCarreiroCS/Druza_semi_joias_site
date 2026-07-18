# Druza — auditoria mobile das páginas públicas

**Data:** 2026-07-18
**Status:** aprovado pelo usuário

## Objetivo

Executar o site localmente, inspecionar as páginas públicas em referências de iPhone e Samsung, corrigir defeitos de imagem, texto e sobreposição e repetir os testes até que a renderização mobile esteja estável.

A direção visual existente, **Cinema Editorial**, deve ser preservada. As mudanças serão pequenas, reversíveis e limitadas aos defeitos comprovados durante a auditoria.

## Escopo desta etapa

### Vitrine e produtos

- `index.html`
- `catalogo.html`
- `brincos.html`
- `produto.html`
- todas as páginas em `produtos/`

### Conteúdo institucional

- `sobre.html`
- `contato.html`
- `cuidados.html`
- `trocas.html`
- `privacidade.html`

### Telas acessíveis sem sessão

- `login.html`
- `cadastro.html`
- `recuperar-senha.html`
- `redefinir-senha.html`
- `pagamento-sucesso.html`
- `pagamento-pendente.html`
- `pagamento-falha.html`

## Fora do escopo

- fluxos autenticados de `conta.html` e `checkout.html`;
- `admin-login.html`, `admin.html` e operações administrativas;
- alterações no Supabase, Mercado Pago, banco de dados ou Edge Functions;
- redesign, troca da direção de arte ou inclusão de novas funcionalidades.

Esses fluxos ficam para a segunda etapa escolhida pelo usuário.

## Dispositivos de referência

| Perfil | Viewport | Navegador de referência |
| --- | --- | --- |
| iPhone 13/14 | 390 × 844 px | Safari móvel |
| Samsung Galaxy S23/S24 | 360 × 780 px | Chrome móvel |

Os dois perfis serão testados em modo retrato. O viewport menor do Samsung funciona também como verificação de robustez para telas Android compactas.

## Arquitetura da auditoria

1. Iniciar um servidor HTTP local na raiz do projeto.
2. Montar o inventário das rotas públicas aprovadas.
3. Renderizar cada rota nos dois perfis de dispositivo.
4. Coletar resultados automáticos de assets, geometria, texto e erros do navegador.
5. Capturar screenshots de página inteira para revisão visual.
6. Corrigir somente defeitos reproduzidos.
7. Reexecutar a mesma matriz e comparar o resultado final.

Os relatórios e screenshots de trabalho ficarão em uma pasta temporária do projeto, sem misturar artefatos de teste com o código de produção.

## Detectores

### Imagens e recursos

- requisições locais com status de erro;
- imagens cujo carregamento terminou com `naturalWidth === 0`;
- referências locais inexistentes;
- imagem deformada por dimensões incompatíveis ou uso incorreto de `object-fit`;
- texto alternativo ausente em imagens informativas alteradas durante a correção.

### Texto

- conteúdo truncado por `overflow`, altura fixa ou line clamp não intencional;
- títulos, preços, botões e rótulos que escapem do contêiner;
- quebras de linha que tornem CTA, preço ou navegação ilegíveis;
- texto encoberto por header, drawer, barra fixa ou outro elemento.

### Geometria e sobreposição

- largura do documento maior que a largura do viewport;
- elementos visíveis posicionados fora da área horizontal útil;
- interseções involuntárias entre elementos irmãos;
- header, menu, sacola ou barra fixa cobrindo conteúdo ou controles;
- z-index incorreto em drawers, overlays, modais e navegação;
- áreas interativas essenciais pequenas ou inacessíveis no toque.

Detectores geométricos podem gerar falsos positivos em elementos decorativos e animações. Cada ocorrência será confirmada visualmente antes de qualquer edição.

### Navegador

- erros JavaScript não tratados;
- recursos locais com falha;
- controles globais que não abrem, fecham ou recebem foco;
- comportamento incompatível com o viewport móvel.

## Estratégia de correção

- Priorizar regras responsivas compartilhadas em `css/styles.css`, `css/account.css` e nos estilos específicos já existentes.
- Alterar HTML apenas quando a estrutura, semântica ou referência de asset for a causa.
- Alterar JavaScript somente quando a falha de estado ou interação for reproduzida no mobile.
- Evitar seletores globais novos quando uma correção puder ser limitada ao componente afetado.
- Preservar tokens, tipografia, paleta, movimento reduzido e linguagem visual documentados em `docs/DESIGN.md` e `docs/DIRECAO-DE-ARTE.md`.

## Tratamento de falhas externas

Indisponibilidade ou bloqueio do Supabase e do Mercado Pago no ambiente local serão registrados separadamente. Uma falha externa não será mascarada com alteração visual e não reprovará uma página se o layout apresentar corretamente o estado de erro previsto.

Nenhuma credencial, configuração de produção ou origem permitida será modificada para esta auditoria visual.

## Critérios de aprovação

Para cada rota e dispositivo:

- nenhum asset local necessário retorna erro;
- nenhuma imagem carregada apresenta largura natural zero;
- não existe scroll horizontal involuntário;
- textos e controles essenciais permanecem dentro do viewport e legíveis;
- não existe sobreposição involuntária confirmada visualmente;
- header, menu, sacola, botões e campos testados permanecem acessíveis;
- não há erro JavaScript relevante causado pelo front-end local;
- o screenshot final foi revisado visualmente.

## Evidências de entrega

- relatório resumido dos defeitos encontrados;
- lista dos arquivos corrigidos;
- resultado da matriz final nos dois aparelhos;
- screenshots finais das páginas ou estados representativos;
- indicação separada de limitações externas e itens adiados para a etapa autenticada.

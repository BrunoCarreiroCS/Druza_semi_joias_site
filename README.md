# Druza Semi Joias - prototipo estatico

Prototipo premium mobile-first em HTML, CSS e JS puro para a Druza Semi Joias. O projeto nao tem backend, checkout real, pagamento real, frete real, login ou integracoes de e-mail em producao.

## Status atual

- Home editorial e pagina de produto navegaveis.
- Paginas basicas de conteudo/SEO: `sobre.html`, `cuidados.html`, `trocas.html`, `contato.html` e `privacidade.html`.
- Catalogo local em `js/catalog.js`, usado para renderizar grades de produtos.
- Drawers de menu e sacola com foco preso, retorno ao gatilho, `Escape`, overlay e live region.
- Sacola funcional com persistencia em `localStorage`, subtotal, quantidade, remocao, cupom, frete e total.
- Barra de progresso para frete gratis e botao de continuar comprando.
- Cupom local `PRIMEIRADRUZA`, com mensagens para cupons expirados/de exemplo.
- Frete simulado por faixa de CEP e reaproveitamento do CEP entre produto, sacola e checkout.
- Checkout simulado com revisao do pedido, mascara de telefone, link de resumo por WhatsApp e limpeza da sacola.
- Produto com seletor de tamanho por botoes, galeria de miniaturas, imagem principal e FAQ.
- Newsletter com consentimento obrigatorio, feedback acessivel e link para politica de privacidade.
- SEO tecnico base em home e produto: canonical, Open Graph, Twitter card e JSON-LD.

## Correcoes feitas nesta rodada

- Botao de busca agora esta desabilitado e anunciado como "Busca em breve", evitando uma acao falsa.
- Checkout fica oculto quando a sacola esta vazia, evitando campos focaveis sem item no pedido.
- Confirmacao do pedido simulado passou para uma mensagem fora do formulario, entao continua visivel apos a sacola ser limpa.
- Miniaturas da galeria agora usam botoes reais em vez de `img role="button"`.
- Seletor visual de tamanho usa `radiogroup`/`radio`; o `select` fica apenas como estado interno.
- Placeholder de produto gerado por JS usa `div`, corrigindo HTML invalido com `p` dentro de `span`.
- Breadcrumb visual e JSON-LD do produto apontam para a mesma categoria da home.
- Paginas auxiliares receberam navegacao simples para nao ficarem isoladas.
- Drawer recebeu `overscroll-behavior: contain` para reduzir vazamento de scroll.
- README foi atualizado com o estado real, pendencias e riscos.

## Como rodar

Sem build. Abra `index.html` direto no navegador ou sirva a pasta localmente:

```bash
python -m http.server 5500
```

Depois acesse `http://localhost:5500`.

## Arquivos relevantes

```text
index.html
produto.html
sobre.html
cuidados.html
trocas.html
contato.html
privacidade.html
css/styles.css
js/main.js
js/catalog.js
img/
DIRECAO-DE-ARTE.md
```

## Placeholders e dados ficticios

Marcados no HTML com `<!-- PLACEHOLDER -->`, com selo `Exemplo`, com selo `placeholder` ou com blocos `.ph`.

- Produtos, nomes, precos, parcelas, SKU, estoque e oferta estruturada sao exemplos.
- Algumas entradas do catalogo apontam para `produto.html` porque ainda nao existem paginas individuais para todos os produtos.
- WhatsApp usa link placeholder (`https://wa.me/`) ate a marca fornecer o numero real.
- CEP retorna mensagens locais fake apenas para demonstrar UX.
- Sacola persiste apenas itens, frete e cupom no navegador via `localStorage`.
- Checkout e simulado: valida campos, gera um numero ficticio de pedido, nao cobra e nao envia dados pessoais.
- Login e newsletter nao persistem dados.
- Onde faltam fotos reais, o layout usa placeholder premium com o texto `Foto em breve` e descricao do asset esperado.

## Contrato local em JS

`js/main.js` centraliza o contrato de UI em `UI_CONTRACT`:

- `storageKey`: chave da sacola no `localStorage`.
- `products`: catalogo minimo vindo de `window.DRUZA_CATALOG`.
- `shippingRules`: respostas fake por prefixo de CEP.
- `shippingFallback`: retorno padrao quando o CEP nao bate nas faixas simuladas.
- `freeShippingCents`: valor minimo para liberar frete gratis.
- `couponCode`, `couponDiscount` e `expiredCouponCodes`: regras locais de cupom.
- `whatsappPlaceholder`: base atual para gerar o resumo do pedido.

Se o projeto evoluir sem framework, o proximo passo natural e extrair regras comerciais para `data/*.json` ou uma camada `js/services/*`, mantendo a interface atual.

## SEO tecnico implementado

- `canonical` em home, produto e paginas auxiliares.
- Open Graph basico na home, produto e sobre.
- JSON-LD:
  - `Organization` em home e produto.
  - `BreadcrumbList` em `produto.html`.
  - `Product` + `Offer` em `produto.html`.

Observacao: os dados estruturados do produto ainda usam valores de exemplo e precisam ser trocados antes de publicacao real.

## Performance e assets

- Nenhuma imagem externa foi adicionada.
- As 3 fotos reais existentes foram reutilizadas com cuidado, evitando repeticao excessiva nas grades dinamicas.
- `loading="lazy"` e `decoding="async"` aplicados onde faz sentido.
- `fetchpriority="high"` aplicado a imagem principal do produto.
- Nao ha `srcset`/`sizes` porque o projeto ainda nao possui variantes reais dos arquivos.

Pendencias de performance:

1. Converter as 3 fotos reais para WebP/AVIF.
2. Criar variantes responsivas das imagens.
3. Gerar uma OG image dedicada.
4. Auto-hospedar fontes ou revisar dependencia do Google Fonts.

## Acessibilidade

- `role="dialog"`, `aria-modal`, `aria-labelledby` e `aria-hidden` nos drawers.
- Foco preso dentro do drawer aberto.
- Retorno de foco ao botao que abriu o drawer.
- Overlay e `Escape` fecham os drawers.
- Conteudo do fundo fica com `inert` quando suportado.
- Feedbacks de formulario e live region da sacola com `aria-live="polite"`.
- Controles de tamanho e miniaturas usam elementos interativos reais.

Pendencias de acessibilidade:

1. Testar com leitor de tela real em mobile.
2. Revisar contraste final depois da etapa de design/arte.
3. Validar ordem de foco completa em todas as paginas apos novas features.

## Riscos e limitacoes

- Sem backend real, todas as acoes de sacola, CEP, checkout e newsletter sao simulacoes locais.
- O checkout nao deve ser usado em producao: ele nao processa pagamento, nao calcula frete real e nao grava pedido.
- `localStorage` pode ser limpo pelo navegador e nao substitui carrinho de loja real.
- `inert` depende do suporte do navegador; onde nao houver suporte, o projeto ainda usa `aria-hidden`, mas o comportamento pode variar.
- Links de WhatsApp ainda nao tem numero oficial.
- O catalogo ainda nao tem paginas dedicadas por produto.
- Textos legais de privacidade, troca e garantia sao exemplos e precisam de revisao juridica/comercial.

## Proximos passos priorizados

1. Substituir catalogo, precos, estoque, textos legais, WhatsApp e politicas por dados reais.
2. Criar paginas individuais ou roteamento estatico para cada produto.
3. Integrar frete, newsletter, checkout e pedidos a servicos reais quando houver backend/plataforma.
4. Completar etapa de design/arte com Claude Code, revisando responsividade, polimento visual e consistencia da marca.
5. Otimizar imagens, gerar OG image e revisar SEO final antes do deploy.
6. Adicionar testes automatizados leves para fluxo de sacola, cupom, frete e checkout simulado.

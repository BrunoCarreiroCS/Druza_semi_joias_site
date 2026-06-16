# Druza Semi Joias — protótipo estático

Protótipo premium mobile-first em HTML, CSS e JS puro para a Druza Semi Joias. Não há backend, checkout, cálculo de frete real, login nem integrações de e-mail em produção neste projeto.

## Status atual

- Home e página de produto navegáveis.
- Drawers de menu e sacola com foco preso, retorno ao gatilho, `Escape`, overlay e live region.
- Validação local no produto para tamanho obrigatório e CEP com 8 dígitos.
- Newsletter com consentimento obrigatório e feedback acessível.
- SEO técnico base aplicado em `index.html` e `produto.html`.

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
css/styles.css
js/main.js
img/
DIRECAO-DE-ARTE.md
```

## Placeholders e dados fictícios

Marcados no HTML com `<!-- PLACEHOLDER -->`, com selo `Exemplo` ou com blocos `.ph`.

- Produtos, nomes, preços, parcelas, SKU, estoque e oferta estruturada são exemplos.
- WhatsApp está em link placeholder (`https://wa.me/`) até a marca fornecer o número real.
- CEP retorna mensagens locais fake apenas para UX do protótipo.
- Sacola, checkout, login e newsletter não persistem dados.
- Onde faltam fotos reais, o layout usa placeholder premium com o texto `Foto em breve` e descrição do asset esperado.

## Contrato local em JS

`js/main.js` centraliza um contrato local simples em `UI_CONTRACT`:

- `shippingRules`: respostas fake por prefixo de CEP.
- `shippingFallback`: retorno padrão quando o CEP não bate nas faixas simuladas.

Se o projeto evoluir sem framework, o próximo passo natural é extrair isso para um arquivo `js/data.js` ou `data/*.json` mantendo a mesma interface.

## SEO técnico implementado

- `canonical` em home e produto.
- Open Graph básico e `twitter:card`.
- JSON-LD:
  - `Organization` em ambas as páginas.
  - `BreadcrumbList` em `produto.html`.
  - `Product` + `Offer` em `produto.html`.

Observação: os dados estruturados do produto ainda usam valores de exemplo e precisam ser trocados antes de publicação real.

## Performance e assets

- Imagens existentes mantidas; nada foi baixado.
- `loading="lazy"` e `decoding="async"` aplicados onde fez sentido.
- `fetchpriority="high"` aplicado à imagem principal do produto.
- Não há `srcset`/`sizes` porque o projeto não possui variantes reais dos arquivos.

Plano pendente:

- Converter as 3 fotos reais para WebP/AVIF.
- Gerar uma OG image dedicada.
- Auto-hospedar fontes para reduzir dependência externa.

## Acessibilidade

- `role="dialog"`, `aria-modal`, `aria-labelledby` e `aria-hidden` nos drawers.
- Foco preso dentro do drawer aberto.
- Retorno de foco ao botão que abriu o drawer.
- Overlay e `Escape` fecham os drawers.
- Conteúdo do fundo fica com `inert` quando suportado.
- Feedbacks de formulário e live region da sacola com `aria-live="polite"`.

## Riscos e limitações

- Sem backend real, todas as ações de sacola, CEP e newsletter são apenas simulações locais.
- `inert` depende do suporte do navegador; onde não houver suporte, o projeto ainda usa `aria-hidden`, mas o bloqueio de foco no fundo pode variar.
- O OG usa assets locais existentes; ainda falta imagem editorial própria para compartilhamento.
- O workspace atual não está inicializado como repositório Git, então não foi possível validar diff/status via Git.

## Próximos passos

1. Substituir placeholders de catálogo, avaliações, WhatsApp e oferta por dados reais.
2. Ligar frete, newsletter e checkout a serviços reais.
3. Criar páginas dedicadas para ajuda, trocas, FAQ e contato quando o conteúdo oficial existir.
4. Converter imagens e revisar SEO final antes de deploy.
# Druza_semi_joias_site

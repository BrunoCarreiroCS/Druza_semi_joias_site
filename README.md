# Druza Semi Joias — e-commerce

Loja virtual da Druza Semi Joias (semi joias femininas em prata, pedras esmeralda e
Paraíba). Front-end estático em **HTML/CSS/JS puro** (sem frameworks, mobile-first),
backend em **Supabase** (Postgres + Auth + Edge Functions) e pagamento via
**MercadoPago Payment Brick** (checkout embutido — cliente paga com cartão ou
Pix sem sair do site e sem precisar ter conta no MercadoPago). Checkout
validado ponta a ponta em ambiente de teste.

## Funcionalidades

- **Loja**: home editorial, catálogo completo (`catalogo.html`), páginas de produto
  (fixas em `produtos/*.html` e genérica via `produto.html?slug=...`), sacola com
  persistência local, cupom e frete simulado por CEP.
- **Contas de cliente**: cadastro 18+ com nome, e-mail e telefone obrigatórios,
  login, recuperação de senha, edição segura dos dados pessoais, histórico de
  pedidos e CRUD de endereços em `conta.html`.
- **Checkout real**: `checkout.html` → Edge Function `create-order` (recalcula
  totais no servidor a partir da tabela `products` — nunca confia no preço do
  navegador) → Payment Brick embutido → Edge Function `process-payment` cobra
  na API do MercadoPago → webhook confirma (Pix) → pedido "Pago".
- **Painel administrativo** (`admin.html`, login dedicado em `admin-login.html`,
  com **2FA obrigatório**): gestão de pedidos (status, rastreio, detalhe logístico
  com cliente/endereço/forma de pagamento) e produtos (preço, estoque, destaque).
  Guia completo em [docs/ADMIN-GUIA.md](docs/ADMIN-GUIA.md).

## Estrutura do projeto

```text
├── *.html                     Páginas (raiz = URLs públicas do site)
├── css/
│   ├── styles.css             Design system (tokens em :root) + componentes
│   ├── account.css            Auth + área da conta + checkout
│   └── admin.css              Painel administrativo
├── js/
│   ├── config.public.js       Configuracao publica usada no GitHub Pages
│   ├── druza.js               UI global (drawers, sacola, filtros, galeria)
│   ├── storefront.js          Vitrine lendo catálogo, destaques e ficha do banco
│   ├── auth.js                Camada de autenticação (window.DruzaAuth)
│   ├── checkout.js            Fluxo de pagamento
│   ├── admin.js               Camada do painel (window.DruzaAdmin, MFA, upload)
│   ├── admin-panel.js         Comportamento das 8 seções do painel
│   └── admin-help.js          Ajuda embutida: ícones (i) e tutorial por seção
├── produtos/                  Páginas fixas dos produtos originais (legado)
├── img/                       Fotos e assets de marca
├── db/
│   ├── schema.sql             Tabelas base (profiles, addresses, orders, order_items) + RLS
│   ├── schema-payments.sql    Colunas de pagamento (MercadoPago)
│   ├── schema-admin.sql       Admin (admins, products, admin_audit_log) + RLS
│   ├── security-final-hardening.sql  Migracao final obrigatoria
│   ├── schema-catalog-inventory.sql  Catálogo completo, estoque auditável e envios
│   ├── *-smoke-test.sql       Testes das migrações (rodam em transação + ROLLBACK)
│   └── schedule-payment-reconciliation.sql  Job HMAC de recuperacao de pagamentos
├── supabase/functions/
│   ├── _shared/               Envelope admin, CORS, rate limit, validação de catálogo
│   ├── create-order/          Cria pedido, preços server-side (sem falar com o MP)
│   ├── process-payment/       Cobra o pedido via Payment Brick (API MercadoPago)
│   ├── webhook-mp/            Confirma pagamento (re-consulta autenticada na API MP)
│   ├── reconcile-stale-payments/  Recupera tentativas interrompidas com HMAC
│   └── admin-*/               14 funções do painel (todas passam por serveAdmin)
└── docs/                      Guias e documentação (ver abaixo)
```

## Como rodar localmente

1. Revise `js/config.public.js`. Ele contem apenas URL/chaves publicas e e
   carregado pelo GitHub Pages. Nunca adicione `service_role` ou Access Token.
2. Sirva a pasta (sem build):

```bash
python -m http.server 5510
```

3. Acesse `http://localhost:5510`. A allowlist das Edge Functions aceita o
   dominio Druza e o GitHub Pages. Para chamar as funcoes a partir do localhost,
   inclua temporariamente essa origem em `ALLOWED_ORIGINS` e faca novo deploy.

## Modelo de segurança (resumo)

A regra geral: **nunca confiar no navegador — toda decisão sensível é revalidada
no servidor.** Detalhes e checklist de produção em [docs/SEGURANCA.md](docs/SEGURANCA.md).

- **RLS e privilegios minimos** — o cliente le apenas os proprios dados e nao
  pode inserir pedidos/itens diretamente.
- **Pedido transacional** — preco, frete, desconto, snapshot e reserva de estoque
  sao calculados no Postgres sob lock.
- **Pagamento idempotente** — claim atomico, valor em centavos e reconciliacao de
  tentativas antigas evitam dupla cobranca e pedido preso.
- **Webhook do MP** exige HMAC, reconsulta a API, confere valor e
  `external_reference`, e trata replay como `no-op`.
- **Reconciliador** exige HMAC-SHA256 com timestamp antes de carregar qualquer
  chave administrativa; o cron busca o secret dedicado no Supabase Vault.
- **Admin**: tabela `admins` sem nenhuma política de escrita (promoção só manual,
  via SQL Editor) + **2FA TOTP obrigatório** verificado **no servidor** (claim
  `aal2` exigido pelas Edge Functions) + log de auditoria de toda ação.
- **CORS restrito** por allowlist, supabase-js **pinado com SRI**
  nas páginas, entradas validadas/limitadas e **rate limiting IP + Postgres** nas Edge
  Functions, **fontes auto-hospedadas** (zero requisições a terceiros além do
  Supabase/MP).

## Documentação (docs/)

| Guia | Conteúdo |
| --- | --- |
| [ADMIN-GUIA.md](docs/ADMIN-GUIA.md) | Painel admin: setup, 2FA, uso diário, recuperação |
| [CATALOGO-E-ESTOQUE.md](docs/CATALOGO-E-ESTOQUE.md) | Produtos, categorias, estoque, envios: arquitetura, migração e uso |
| [SEGURANCA.md](docs/SEGURANCA.md) | Camadas de segurança + checklist de produção |
| [MERCADOPAGO-SETUP.md](docs/MERCADOPAGO-SETUP.md) | Integração MP: credenciais, webhook, testes |
| [BACKEND-SETUP.md](docs/BACKEND-SETUP.md) | Supabase: projeto, schema, auth |
| [GUIA-DE-PRODUCAO.md](docs/GUIA-DE-PRODUCAO.md) | Checklist de publicação |
| [DIRECAO-DE-ARTE.md](docs/DIRECAO-DE-ARTE.md) | Design system (paleta, tipografia, componentes) |
| [DESIGN.md](docs/DESIGN.md) / [PRODUCT.md](docs/PRODUCT.md) | Decisões de design e produto |
| [IDEIAS-ADMIN-LOGISTICA.md](docs/IDEIAS-ADMIN-LOGISTICA.md) | Backlog priorizado de melhorias futuras |
| [EVOLUCAO.md](docs/EVOLUCAO.md) | Linha do tempo de tudo que já foi construído |

## Deploy das Edge Functions

Um comando publica todas de uma vez, respeitando o `verify_jwt` que cada uma
declara em `supabase/config.toml`:

```bash
supabase functions deploy
```

Para publicar uma função isolada, passe o nome:

```bash
supabase functions deploy create-order
supabase functions deploy process-payment
supabase functions deploy webhook-mp --no-verify-jwt
supabase functions deploy reconcile-stale-payments --no-verify-jwt
supabase functions deploy admin-list-orders
supabase functions deploy admin-update-order
supabase functions deploy admin-get-order
supabase functions deploy admin-list-products
supabase functions deploy admin-upsert-product
supabase functions deploy admin-delete-product
supabase functions deploy admin-dashboard
supabase functions deploy admin-list-categories
supabase functions deploy admin-upsert-category
supabase functions deploy admin-delete-category
supabase functions deploy admin-inventory-move
supabase functions deploy admin-list-inventory
supabase functions deploy admin-list-customers
supabase functions deploy admin-list-audit
```

O `verify_jwt = false` do reconciliador e intencional: o gateway nao valida JWT,
mas o proprio handler exige a assinatura HMAC v1 do cron. Nao invoque esse
endpoint manualmente. Os nomes operacionais sao
`RECONCILE_CRON_HMAC_SECRET_CURRENT`, o opcional
`RECONCILE_CRON_HMAC_SECRET_PREVIOUS` e `druza_reconcile_cron_hmac` no Vault;
valores nunca devem ser versionados ou registrados.

## Estado e pendências

- ✅ Checkout MercadoPago validado ponta a ponta (ambiente de teste).
- ✅ Webhook seguro (re-consulta na API + verificação de valor).
- 🚀 **Catálogo e estoque no painel** (codado; **requer rodar
  `db/schema-catalog-inventory.sql` + deploy das 14 functions `admin-*`**):
  cadastro completo de produto com fotos e ficha técnica, categorias
  gerenciáveis, entrada/saída de estoque com histórico imutável, clientes,
  envios com rastreio e a vitrine lendo o catálogo do banco.
  Ver [docs/CATALOGO-E-ESTOQUE.md](docs/CATALOGO-E-ESTOQUE.md).
  Enquanto a migração não roda, a loja continua exibindo o catálogo estático —
  o `storefront.js` mantém o HTML atual quando a consulta falha.
- ✅ Painel admin com 2FA (codado; requer rodar `db/schema-admin.sql` + deploy).
- ✅ Pacote logística admin 1/5/6/8 codado: rastreio clicável/copiar, alerta de pago parado, filtro por período, CSV e notas internas (requer rodar schema + redeploy das functions tocadas).
- ✅ Etiqueta de envio + romaneio imprimível por pedido (front-end puro). Ainda
  faltam (backlog): remetente configurável, declaração de conteúdo dos Correios
  e impressão em lote — ver [docs/IDEIAS-ADMIN-LOGISTICA.md](docs/IDEIAS-ADMIN-LOGISTICA.md) item 3.
- ✅ Imagens WebP, fontes auto-hospedadas, robots.txt + sitemap.xml, rate limiting.
- ✅ Analytics: scaffold do GA4 pronto em `js/analytics.js` (desativado até colar
  o Measurement ID).
- ⏳ Produção: domínio, hospedagem, credenciais MP reais, `ALLOWED_ORIGIN`,
  Measurement ID do GA4 — checklist acionável em
  [docs/GUIA-DE-PRODUCAO.md](docs/GUIA-DE-PRODUCAO.md).

Linha do tempo completa de como o projeto evoluiu: [docs/EVOLUCAO.md](docs/EVOLUCAO.md).

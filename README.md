# Druza Semi Joias — e-commerce

Loja virtual da Druza Semi Joias (semi joias femininas em prata, pedras esmeralda e
Paraíba). Front-end estático em **HTML/CSS/JS puro** (sem frameworks, mobile-first),
backend em **Supabase** (Postgres + Auth + Edge Functions) e pagamento via
**MercadoPago Checkout Pro**. Checkout validado ponta a ponta em ambiente de teste.

## Funcionalidades

- **Loja**: home editorial, catálogo completo (`catalogo.html`), páginas de produto
  (fixas em `produtos/*.html` e genérica via `produto.html?slug=...`), sacola com
  persistência local, cupom e frete simulado por CEP.
- **Contas de cliente**: cadastro, login, recuperação de senha, área da conta
  (`conta.html`) com histórico de pedidos e CRUD de endereços.
- **Checkout real**: `checkout.html` → Edge Function `create-preference` (recalcula
  totais no servidor a partir da tabela `products` — nunca confia no preço do
  navegador) → MercadoPago → webhook confirma o pagamento → pedido "Pago".
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
│   ├── config.example.js      Modelo → copie para js/config.js (gitignored)
│   ├── catalog.js             Catálogo: conteúdo estático + preço/estoque ao vivo do banco
│   ├── main.js                UI global (drawers, sacola, grids, frete/cupom)
│   ├── product-page.js        Render da página de produto (por id fixo ou ?slug=)
│   ├── auth.js                Camada de autenticação (window.DruzaAuth)
│   ├── checkout.js            Fluxo de pagamento
│   └── admin.js               Camada do painel (window.DruzaAdmin, MFA)
├── produtos/                  Páginas fixas dos produtos originais
├── img/                       Fotos e assets de marca
├── db/
│   ├── schema.sql             Tabelas base (profiles, addresses, orders, order_items) + RLS
│   ├── schema-payments.sql    Colunas de pagamento (MercadoPago)
│   └── schema-admin.sql       Admin (admins, products, admin_audit_log) + RLS
├── supabase/functions/
│   ├── _shared/               require-admin.ts (autorização + 2FA) · cors.ts
│   ├── create-preference/     Cria pedido + preferência MP (preços server-side)
│   ├── webhook-mp/            Confirma pagamento (re-consulta autenticada na API MP)
│   └── admin-*/               6 funções do painel (sempre passam por require-admin)
└── docs/                      Guias e documentação (ver abaixo)
```

## Como rodar localmente

1. Copie `js/config.example.js` → `js/config.js` e preencha `SUPABASE_URL` e
   `SUPABASE_ANON_KEY` (nunca a service_role — o arquivo já é gitignored).
2. Sirva a pasta (sem build):

```bash
python -m http.server 5510
```

3. Acesse `http://localhost:5510`. Para testar o fluxo do MercadoPago de ponta a
   ponta é preciso um túnel público (`ngrok http 5510`) — o MP recusa `localhost`
   nas URLs de retorno. Detalhes em [docs/MERCADOPAGO-SETUP.md](docs/MERCADOPAGO-SETUP.md).

## Modelo de segurança (resumo)

A regra geral: **nunca confiar no navegador — toda decisão sensível é revalidada
no servidor.** Detalhes e checklist de produção em [docs/SEGURANCA.md](docs/SEGURANCA.md).

- **RLS em todas as tabelas** — cada cliente só lê/escreve os próprios dados.
- **Preços recalculados no servidor** a partir da tabela `products` (o valor
  enviado pelo navegador é ignorado).
- **Webhook do MP** não confia na notificação: re-consulta o pagamento na API do
  MercadoPago com o Access Token da conta + confere o valor antes de marcar "pago".
- **Admin**: tabela `admins` sem nenhuma política de escrita (promoção só manual,
  via SQL Editor) + **2FA TOTP obrigatório** verificado **no servidor** (claim
  `aal2` exigido pelas Edge Functions) + log de auditoria de toda ação.
- **CORS restringível** por env (`ALLOWED_ORIGIN`), supabase-js **pinado com SRI**
  nas páginas, entradas validadas/limitadas e **rate limiting por IP** nas Edge
  Functions, **fontes auto-hospedadas** (zero requisições a terceiros além do
  Supabase/MP).

## Documentação (docs/)

| Guia | Conteúdo |
| --- | --- |
| [ADMIN-GUIA.md](docs/ADMIN-GUIA.md) | Painel admin: setup, 2FA, uso diário, recuperação |
| [SEGURANCA.md](docs/SEGURANCA.md) | Camadas de segurança + checklist de produção |
| [MERCADOPAGO-SETUP.md](docs/MERCADOPAGO-SETUP.md) | Integração MP: credenciais, webhook, testes |
| [BACKEND-SETUP.md](docs/BACKEND-SETUP.md) | Supabase: projeto, schema, auth |
| [GUIA-DE-PRODUCAO.md](docs/GUIA-DE-PRODUCAO.md) | Checklist de publicação |
| [DIRECAO-DE-ARTE.md](docs/DIRECAO-DE-ARTE.md) | Design system (paleta, tipografia, componentes) |
| [DESIGN.md](docs/DESIGN.md) / [PRODUCT.md](docs/PRODUCT.md) | Decisões de design e produto |

## Deploy das Edge Functions

```bash
supabase functions deploy create-preference
supabase functions deploy webhook-mp --no-verify-jwt
supabase functions deploy admin-list-orders
supabase functions deploy admin-update-order
supabase functions deploy admin-get-order
supabase functions deploy admin-list-products
supabase functions deploy admin-upsert-product
supabase functions deploy admin-delete-product
```

## Estado e pendências

- ✅ Checkout MercadoPago validado ponta a ponta (ambiente de teste).
- ✅ Webhook seguro (re-consulta na API + verificação de valor).
- ✅ Painel admin com 2FA (codado; requer rodar `db/schema-admin.sql` + deploy).
- ✅ Pacote logística admin 1/5/6/8 codado: rastreio clicável/copiar, alerta de pago parado, filtro por período, CSV e notas internas (requer rodar schema + redeploy das functions tocadas).
- ✅ Imagens WebP, fontes auto-hospedadas, robots.txt + sitemap.xml, rate limiting.
- ⏳ Produção: domínio, credenciais MP reais, analytics, `ALLOWED_ORIGIN`, headers
  do host — ver [docs/SEGURANCA.md](docs/SEGURANCA.md) e
  [docs/GUIA-DE-PRODUCAO.md](docs/GUIA-DE-PRODUCAO.md).

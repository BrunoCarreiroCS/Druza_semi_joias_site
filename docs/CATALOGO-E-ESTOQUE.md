# Catálogo, estoque e logística — Druza

Documentação da área do painel administrativo que cuida de **produtos,
categorias, estoque, pedidos e envios**, e de como esses dados chegam à loja.

Se você quer só **usar** o painel, vá direto para
[Como fazer as tarefas do dia a dia](#7-como-fazer-as-tarefas-do-dia-a-dia).

---

## Índice

1. [O que foi construído](#1-o-que-foi-construído)
2. [Arquitetura](#2-arquitetura)
3. [Como o estoque funciona](#3-como-o-estoque-funciona)
4. [Pedido, pagamento e estoque](#4-pedido-pagamento-e-estoque)
5. [Entidades e migrações](#5-entidades-e-migrações)
6. [Instalação](#6-instalação)
7. [Como fazer as tarefas do dia a dia](#7-como-fazer-as-tarefas-do-dia-a-dia)
8. [Segurança](#8-segurança)
9. [Como testar](#9-como-testar)
10. [Limitações conhecidas](#10-limitações-conhecidas)

---

## 1. O que foi construído

O painel antes acompanhava pedidos e tinha um cadastro mínimo de produto
(nome, preço, categoria em texto livre, quantidade). Agora ele tem:

- **Visão geral** com vendas do dia/semana/mês, funil de pedidos, produtos sem
  estoque e com estoque baixo, e atalhos para as ações mais frequentes.
- **Produtos** com ficha completa: fotos, descrições, categoria, coleção,
  etiquetas, características da semijoia (material, banho, pedra, dimensões,
  tamanhos, garantia…), preço promocional com janela, custo, margem calculada,
  estoque mínimo e dados de SEO.
- **Categorias** gerenciáveis, com hierarquia de um nível e proteção contra
  exclusão que deixaria produtos órfãos.
- **Estoque** com entrada, saída, correção de inventário e um **histórico
  imutável** de todas as movimentações.
- **Clientes** montados a partir dos pedidos existentes.
- **Envios** com transportadora, código de rastreio, link, data de postagem e
  impressão de etiqueta + declaração de conteúdo.
- **Histórico** das ações administrativas.
- **A loja lendo o banco**: uma peça cadastrada no painel aparece no catálogo e
  ganha página própria sem ninguém editar HTML.

---

## 2. Arquitetura

Nada de framework novo. A pilha continua a mesma:

| Camada | Tecnologia |
|---|---|
| Loja e painel | HTML + CSS + JavaScript sem build, servidos como arquivos estáticos |
| Banco | PostgreSQL (Supabase), com RLS em todas as tabelas |
| Regras de negócio críticas | Funções PL/pgSQL (`security definer`) |
| API administrativa | Edge Functions em Deno/TypeScript |
| Autenticação | Supabase Auth + tabela `admins` + 2FA TOTP obrigatório |
| Pagamento | Mercado Pago (Payment Brick + webhook idempotente) |
| Fotos | Supabase Storage, bucket `product-images` |

### Onde cada coisa mora

```
admin.html                    Estrutura do painel (8 seções)
js/admin-panel.js             Comportamento do painel
js/admin-help.js              Ajuda embutida: ícones (i) e tutorial por seção
js/admin.js                   Chamadas às Edge Functions + upload de foto
js/storefront.js              Vitrine lendo o catálogo do banco
css/admin.css                 Layout do painel (navegação lateral / gaveta)

db/schema-catalog-inventory.sql            A migração
db/schema-catalog-inventory-smoke-test.sql O teste da migração

supabase/functions/_shared/
  admin-endpoint.ts           Envelope comum: CORS, método, rate limit, admin, JSON
  catalog-validation.ts       Validação e normalização (módulo puro, testado)
  http-error.ts               Erro de regra de negócio com status HTTP
```

### Por que as regras críticas ficam no banco

Estoque e pagamento mudam em **transação**. Uma Edge Function que fizesse
"lê o saldo, decide, escreve o saldo" em três chamadas separadas abriria janela
para duas compras simultâneas passarem pela mesma última peça. Por isso a
decisão vive em funções PL/pgSQL que travam a linha do produto com
`FOR UPDATE` antes de comparar o saldo. A Edge Function valida a entrada,
confirma quem está chamando e delega.

### O envelope das rotas administrativas

Toda função `admin-*` passa por `serveAdmin()`, que executa **sempre**, nesta
ordem: preflight CORS → origem permitida → método POST → rate limit → tamanho
do corpo → `requireAdmin` (JWT válido + estar em `public.admins` + sessão em
`aal2`) → parse do JSON. Só então o código específico roda. Uma rota nova não
tem como esquecer uma dessas travas, porque não existe caminho de entrada que
as pule.

---

## 3. Como o estoque funciona

### Os três números

```
disponível = products.stock_quantity      ← é o que a loja pode vender agora
reservado  = itens de pedidos com reserva viva
físico     = disponível + reservado       ← o que está na gaveta
```

`products.stock_quantity` guarda o **disponível**, não o físico. Isso já era
assim antes desta entrega: `create_reserved_order` desconta na hora em que o
pedido é criado, para segurar a peça enquanto o pagamento não conclui.

O **reservado não é guardado em coluna nenhuma**: ele é calculado a partir dos
pedidos, por `public.product_stock_snapshot()`. Número derivado guardado em
dois lugares vira dois números diferentes no primeiro erro.

### O livro-razão

Toda alteração de saldo — automática ou manual — grava uma linha em
`public.inventory_movements` com produto, tipo, quantidade, **saldo antes**,
**saldo depois**, motivo, pedido relacionado, quem fez e quando.

A tabela é *append-only*: um gatilho recusa `DELETE` e recusa `UPDATE` que
mexa em qualquer número, data ou motivo. O único `UPDATE` tolerado é o
`ON DELETE SET NULL` que o próprio Postgres aplica nas chaves estrangeiras
quando o produto ou o pedido apontado deixa de existir.

Tipos de movimentação:

| Origem | Tipos |
|---|---|
| Automática | `saldo_inicial`, `reserva`, `liberacao_reserva`, `venda` |
| Manual (painel) | `entrada`, `devolucao`, `troca`, `ajuste_positivo`, `ajuste_negativo`, `perda`, `avaria`, `inventario` |

Os tipos automáticos **não podem** ser lançados à mão: `admin_move_inventory`
recusa qualquer um deles.

### Por que o saldo não muda na ficha do produto

Editar um produto não altera `stock_quantity`. Quantidade só muda por
movimentação registrada — assim a soma do livro-razão sempre bate com o saldo
atual. A única exceção é o campo "quantidade inicial", que aparece apenas no
**cadastro** e entra no histórico como uma `entrada`.

### Estoque baixo

Cada produto tem `min_stock`. A coluna `low_stock` é calculada pelo próprio
banco (`stock_quantity <= min_stock`), o que permite filtrar direto na consulta
em vez de trazer o catálogo inteiro para comparar em memória.

---

## 4. Pedido, pagamento e estoque

Este fluxo **já existia e foi preservado**. O que mudou é que cada passo agora
também escreve no livro-razão e na linha do tempo do pedido.

```
Cliente finaliza a compra
   └─ create_reserved_order()        [transação]
      ├─ trava as linhas dos produtos (FOR UPDATE, ordenadas por slug)
      ├─ recusa se faltar estoque ou o produto estiver fora da loja
      ├─ calcula preço, desconto e frete no servidor
      ├─ grava o pedido + itens com snapshot de nome e preço
      ├─ desconta o estoque            → movimentação `reserva`
      └─ marca reserva com validade de 30 minutos

Mercado Pago responde
   └─ apply_payment_event()          [transação, idempotente]
      ├─ registra o evento em payment_webhook_events (chave única)
      ├─ se já existia → devolve "duplicate" e não faz mais nada
      ├─ aprovado  → consume_order_inventory()  → movimentação `venda`
      └─ recusado  → release_order_reservation() → movimentação `liberacao_reserva`
```

### As garantias, e o que as sustenta

| Garantia | Mecanismo |
|---|---|
| Estoque nunca fica negativo | `CHECK (stock_quantity >= 0)` + comparação sob `FOR UPDATE` |
| Duas compras da última peça não passam juntas | Locks de linha em ordem fixa por `slug` (evita deadlock) |
| Webhook repetido não desconta de novo | `payment_webhook_events` com `UNIQUE (mp_payment_id, mp_status)` |
| Pagamento aprovado desconta uma vez só | `orders.stock_consumed_at` — se já tem data, a função retorna sem agir |
| Cancelamento processado duas vezes não infla o estoque | `orders.stock_released_at` — mesma trava, ao contrário |
| Clique duplo em "Confirmar" no estoque | Chave de idempotência por envio, gerada pelo painel |
| Preço do pedido não muda quando o produto muda | `order_items` guarda nome e preço do momento da compra |
| Reserva não presa para sempre | `reservation_expires_at` + job de reconciliação |

### Reembolso e devolução

Reembolso financeiro e retorno da mercadoria são coisas diferentes e o sistema
não confunde as duas. Um pagamento estornado muda o pedido para `refunded`,
mas **não devolve peça ao estoque** — a mercadoria pode nem ter voltado. Quando
a peça chegar de volta, registre uma movimentação de `devolucao` na seção
Estoque. Assim o histórico mostra o que realmente aconteceu.

---

## 5. Entidades e migrações

Toda a mudança está em **`db/schema-catalog-inventory.sql`**, idempotente e
reexecutável.

### Tabelas novas

| Tabela | Para quê |
|---|---|
| `categories` | Categorias gerenciáveis, com pai opcional, ordem e SEO |
| `product_images` | Galeria por produto, com principal e ordenação |
| `inventory_movements` | Livro-razão imutável do estoque |
| `order_status_history` | Linha do tempo de cada pedido |

### Colunas adicionadas

`products` — `sku`, `status`, `category_id`, `collection`, `tags`,
`short_description`, `long_description`, `compare_at_price_cents`,
`promo_price_cents`, `promo_starts_at`, `promo_ends_at`, `cost_cents`,
`min_stock`, `attributes` (jsonb), `seo_title`, `seo_description`,
`archived_at`, `low_stock` (calculada).

`orders` — `shipping_carrier`, `tracking_url`, `posted_at`, `delivered_at`.

### Compatibilidade com o que já existia

As colunas antigas continuam funcionando, sincronizadas por gatilho:

- `products.active` ⇄ `products.status` — quem escrever só o booleano
  (código antigo) continua sendo obedecido; quem escrever `status` manda.
- `products.category` (texto) ⇄ `products.category_id` — o slug da categoria é
  espelhado no campo antigo, então a policy `products_select_active`, o
  `create_reserved_order` e o checkout seguem inalterados.

### O que a migração preserva

- Nenhum produto, pedido ou cliente é apagado.
- SKU é gerado para o acervo existente (`DRZ-0001`…) sem colisão.
- As categorias que existiam como texto viram linhas em `categories`.
- O saldo atual de cada produto entra no livro-razão como um lançamento
  `saldo_inicial`, para a soma bater desde o primeiro dia.
- Cada pedido existente ganha um evento `pedido_criado` na linha do tempo.

### Reversão

O arquivo roda dentro de `BEGIN`/`COMMIT`: se qualquer comando falhar, nada é
aplicado. Depois de aplicado, reverter significa remover as tabelas e colunas
novas — o que descarta o histórico de estoque, então não há script automático
para isso de propósito. Faça backup antes (Supabase → Database → Backups).

---

## 6. Instalação

### 6.1 Rodar a migração

No Supabase Studio → **SQL Editor**, cole e execute, **nesta ordem**, os
arquivos que ainda não tiverem sido aplicados:

```
1. db/schema.sql
2. db/schema-payments.sql
3. db/schema-admin.sql
4. db/security-final-hardening.sql
5. db/schema-catalog-inventory.sql      ← o novo
```

Se o projeto já está no ar, só o passo 5 é necessário.

### 6.2 Publicar as Edge Functions

Na pasta do projeto, um comando publica **todas** as funções de uma vez:

```bash
supabase functions deploy
```

Sem nome de função, o CLI envia tudo que está em `supabase/functions/` e
respeita o que `supabase/config.toml` declara para cada uma — inclusive o
`verify_jwt = false` do `webhook-mp` e do `reconcile-stale-payments`. Por isso
o antigo `--no-verify-jwt` não é mais necessário. No reconciliador essa flag e
intencional: antes de qualquer acesso administrativo, o handler valida o HMAC
v1 enviado pelo cron com timestamp e secret dedicado no Vault.

Para publicar só uma função (útil ao corrigir um detalhe):

```bash
supabase functions deploy admin-inventory-move
```

Conferir o que está publicado:

```bash
supabase functions list
```

**Antes do primeiro deploy**, se o CLI pedir autenticação ou vínculo:

```bash
supabase login              # abre o navegador para autorizar
supabase link --project-ref hqkpgghlbwincahfwkem
```

As variáveis existentes continuam valendo: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `MP_ACCESS_TOKEN` e
`ALLOWED_ORIGINS`. O reconciliador adiciona
`RECONCILE_CRON_HMAC_SECRET_CURRENT` e, somente durante rotacao,
`RECONCILE_CRON_HMAC_SECRET_PREVIOUS`. O mesmo valor de `CURRENT` fica no item
`druza_reconcile_cron_hmac` do Vault; nenhum desses valores e publico.

### 6.3 Conferir o bucket de fotos

A migração cria o bucket `product-images` (público para leitura, escrita só
para quem está em `public.admins`, 5 MB por arquivo, JPG/PNG/WebP/AVIF).
Confira em Supabase → Storage que ele apareceu.

### 6.4 Criar o primeiro administrador

Continua manual, de propósito — ninguém vira admin pelo site:

```sql
insert into public.admins (user_id, note)
select id, 'dona da loja' from auth.users where email = 'seu@email.com';
```

Depois entre em `admin-login.html` e ative o 2FA no primeiro acesso.

### 6.5 Rodar o site localmente

```bash
python -m http.server 5002
```

E abra `http://localhost:5002`. Para o painel funcionar localmente, adicione
`http://localhost:5002` à variável `ALLOWED_ORIGINS` das Edge Functions.

---

## 7. Como fazer as tarefas do dia a dia

### Cadastrar um produto

1. **Produtos** → **+ Novo produto**.
2. Preencha **nome** e **preço** — só isso é obrigatório.
3. Em **Fotos**, clique em "Escolher fotos". A primeira vira a principal;
   dá para trocar a principal e reordenar depois.
4. Preencha o que fizer sentido nas outras seções. O que ficar em branco
   simplesmente não aparece no site.
5. Informe a **quantidade inicial em estoque**.
6. **Salvar produto**.

A peça aparece no catálogo assim que a situação estiver em "À venda".

### Registrar entrada de estoque

**Estoque** → escolha o produto → "Entrada de mercadoria" → quantidade →
(opcional: custo por peça e fornecedor) → **Confirmar movimentação**.

O custo informado atualiza o custo do produto e alimenta o cálculo de margem.

### Registrar uma perda ou peça danificada

Mesma tela, escolhendo "Perda" ou "Peça danificada". Nesses casos o **motivo
é obrigatório** — estoque que sai sem explicação vira mistério três meses
depois.

### Corrigir o estoque depois de uma contagem

Use **"Corrigir para a quantidade contada"** e informe o que você contou de
verdade na prateleira. O sistema calcula a diferença sozinho e registra o
ajuste no histórico.

### Adicionar código de rastreio

**Envios** (já vem filtrado nos pedidos pagos sem rastreio) → **Adicionar
rastreio** → preencha transportadora e código → **Salvar e marcar como
enviado**.

Para código dos Correios (formato `AA123456789BR`), o link de rastreamento é
montado sozinho.

### Imprimir etiquetas

**Envios** → **Remetente** (uma vez só, fica salvo) → **Imprimir etiquetas**.
Sai uma página por pedido com etiqueta, lista de separação e declaração de
conteúdo.

### Tirar um produto da loja

- **Tirar da loja**: some da vitrine, o estoque continua contado, volta quando
  você quiser.
- **Arquivar**: some da vitrine e da lista do painel. Use para peças
  encerradas.

Produto nunca é apagado de verdade, porque pedidos antigos apontam para ele.

---

## 8. Segurança

O que já existia foi mantido e estendido:

- **Autorização no servidor.** Esconder um botão não é trava. Toda rota
  administrativa revalida JWT + presença em `public.admins` + 2FA (`aal2`).
- **Sem escrita pelo navegador.** Não existe policy de `INSERT`/`UPDATE`/
  `DELETE` para `authenticated` em `products`, `categories` ou
  `product_images`. Toda escrita passa pela `service_role` dentro das Edge
  Functions.
- **Sem mass assignment.** `catalog-validation.ts` monta o objeto campo a
  campo a partir de uma lista fechada. Mandar `stock_quantity`, `active` ou
  `id` no corpo não tem efeito nenhum.
- **Fotos.** Só caminho local (`img/…`) ou HTTPS no host do próprio projeto.
  `javascript:`, `data:` e host de terceiro são recusados. O upload sai do
  navegador com o JWT da administradora; a `service_role` nunca vai para o
  cliente.
- **Custo fora da vitrine.** `cost_cents` não está entre as colunas que `anon`
  e `authenticated` podem ler.
- **Erros sem vazamento.** A mensagem crua do Postgres nunca vai para a
  resposta; ela pode carregar nome de coluna, constraint e trecho do payload.
  O log do servidor guarda o detalhe; o cliente recebe texto genérico.
- **Auditoria.** Toda escrita administrativa grava em `admin_audit_log` quem
  fez, o quê, sobre qual registro e quando — sem senha, token ou dado de cartão.

---

## 9. Como testar

### Teste do banco (30 verificações)

```sql
-- No SQL Editor do Supabase, depois da migração.
-- Roda em transação e termina em ROLLBACK: não deixa nada para trás.
db/schema-catalog-inventory-smoke-test.sql
```

Cobre: cadastro e edição de produto, SKU duplicado, arquivamento, entrada,
saída, saída maior que o estoque, correção de inventário, idempotência do
clique duplo, imutabilidade do livro-razão, alerta de estoque baixo, reserva,
pagamento aprovado descontando uma única vez, webhook repetido, liberação de
reserva, dupla liberação, venda acima do estoque, produto inativo, rastreio na
linha do tempo e as permissões de leitura e escrita.

Se terminar sem erro, passou. Qualquer falha levanta uma exceção com nome
próprio (`test_failed_…`).

### Testes da validação

```bash
deno test supabase/functions/_shared/catalog-validation.test.ts
```

### Verificações de código

```bash
deno check supabase/functions/*/index.ts supabase/functions/_shared/*.ts
deno lint supabase/functions/
```

Não há passo de build: o site é servido como arquivos estáticos.

### Roteiro manual completo

1. Cadastre um produto com foto e 5 unidades.
2. Confira que ele aparece em `catalogo.html` e que a página própria abre.
3. Registre uma entrada de 3 unidades — o saldo vai para 8.
4. Compre 1 unidade pela loja — o disponível cai para 7 e aparece uma
   movimentação `reserva`.
5. Aprove o pagamento — o pedido vira "Pago" e há **uma única** movimentação
   `venda`.
6. Adicione o rastreio e marque como enviado.
7. Confira a linha do tempo do pedido nos detalhes.
8. Tente registrar uma saída maior que o estoque — deve ser recusada com
   "Não há estoque suficiente para concluir essa saída."

---

## 10. Limitações conhecidas

**Variantes por tamanho/cor não têm estoque próprio.** O carrinho, o
`create_reserved_order` e o `order_items` identificam a peça pelo `slug`.
Dar estoque próprio a cada variante exigiria mudar essas três coisas e migrar
os pedidos existentes — risco alto para um catálogo desta escala. O campo
"Tamanhos" é informativo e vira o seletor na loja. **Quando um tamanho precisar
de contagem separada, cadastre-o como produto próprio** (ex.: "Anel Paraíba
aro 16"). Se o catálogo crescer a ponto de isso incomodar, o caminho é uma
tabela `product_variants` com `order_items.variant_id`.

**Não há e-mail automático de rastreio.** O projeto não tem infraestrutura de
envio de e-mail transacional. O código de rastreio é salvo e fica visível para
a cliente em "Minha conta"; avisar por WhatsApp continua manual. A camada está
pronta para receber esse envio quando houver um provedor configurado — nada de
e-mail fictício foi implementado.

**As páginas estáticas em `produtos/` continuam existindo.** As sete peças
originais têm páginas próprias em HTML, ainda no `sitemap.xml`. O catálogo
agora aponta para `produto.html?slug=…`, que serve qualquer produto do banco.
As páginas antigas podem ser removidas quando você quiser — nenhuma
funcionalidade depende delas.

**A busca de pedidos por e-mail depende de `admin_find_user_ids`.** É uma
função `security definer` que lê `auth.users`, porque o e-mail não fica em
nenhuma tabela do schema `public`. Ela só é executável pela `service_role`.

**Reservas expiradas dependem do job de reconciliação.** Já configurado em
`db/schedule-payment-reconciliation.sql`, ele assina cada chamada com HMAC e
nao deve ser substituido por chamadas manuais. Se ele não estiver rodando, uma
reserva abandonada segura a peça por até 30 minutos a mais do que deveria.

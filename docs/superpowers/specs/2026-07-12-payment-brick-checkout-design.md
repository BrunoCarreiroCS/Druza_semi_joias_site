# Payment Brick — checkout embutido sem conta MercadoPago

**Data:** 2026-07-12
**Status:** Aprovado para planejamento

## Contexto e motivação

O checkout atual (`checkout.html` + `js/checkout.js` + `supabase/functions/create-preference`)
usa o **Checkout Pro** do MercadoPago: a Edge Function cria uma *preference* e o browser é
redirecionado para `init_point`, um domínio do MercadoPago, onde o cliente paga.

Um consultor de pagamentos recomendou migrar para **Payment Brick** (checkout transparente):
o formulário de pagamento fica embutido na própria página da Druza — o cliente nunca sai do
site, não precisa ter conta no MercadoPago, e a experiência fica mais profissional/integrada.
A única armadilha a evitar é configurar o pagamento como `purpose: wallet_purchase`, que
restringiria o pagamento a quem já tem carteira MP — este design não usa esse modo.

Decisões já tomadas com o usuário:
- Substituir o Checkout Pro completamente (não manter como fallback).
- Meios de pagamento: **cartão de crédito/débito + Pix** (boleto fica de fora por ora).

## Arquitetura

```
checkout.js
  1. calcula carrinho/endereço (igual hoje)
  2. chama Edge Function "create-order" → cria pedido (status=pending) no banco,
     recalcula total no servidor, NÃO fala com o MercadoPago. Retorna { order_id, total_cents }.
  3. inicializa o Payment Brick (SDK JS v2 do MercadoPago) dentro de
     <div id="paymentBrick_container"> com esse total.
  4. cliente preenche cartão (Brick tokeniza no browser via iframe do MP — o número do
     cartão nunca chega ao servidor Druza) ou escolhe Pix.
  5. no callback onSubmit do Brick, checkout.js chama a Edge Function "process-payment"
     com { order_id, ...dados do Brick }.
  6. process-payment chama POST /v1/payments na API do MercadoPago (Access Token secreto,
     só no servidor), atualiza o pedido, retorna { status, next_page }.
  7. checkout.js navega para pagamento-sucesso.html / pagamento-pendente.html /
     pagamento-falha.html conforme o status — essas páginas já existem e só leem ?order=,
     não precisam mudar.

webhook-mp (já existe, não muda): continua recebendo notificações assíncronas do MP
(principalmente confirmação de Pix) e promovendo o pedido pra "paid" depois de
reconsultar a API do MP — ele já é agnóstico a quem criou o pagamento.
```

## Componentes afetados

### Removido
- `supabase/functions/create-preference/` — apagado. Toda a lógica de resolver
  endereço/recalcular preços migra para `create-order`.

### Novo: `supabase/functions/create-order/index.ts`
Basicamente os passos 1–5 do `create-preference` atual, sem a parte 6/7 (chamada ao MP):
- Autentica via JWT (igual hoje).
- Valida body (`items`, `address_id` ou `address`, `coupon`).
- Resolve/insere endereço.
- Recalcula subtotal/desconto/frete/total a partir do catálogo (`products` table) —
  nunca confia em preço vindo do browser (mesma defesa que já existe hoje).
- Insere `orders` (status `pending`) + `order_items`.
- Retorna `{ order_id, total_cents }` — o frontend precisa do total para inicializar o
  Brick com o valor certo.
- Rate limit igual ao atual (10/min por IP).

### Novo: `supabase/functions/process-payment/index.ts`
- Autentica via JWT.
- Recebe `{ order_id, token?, payment_method_id, installments?, payer, issuer_id? }`
  (formato que o Payment Brick devolve no `onSubmit` — token só existe para cartão, Pix
  não tem token).
- Rebusca o pedido no banco por `order_id`, confirma `user_id` bate com o JWT e pega o
  `total_cents` oficial (nunca confia em valor vindo do frontend).
- Chama `POST https://api.mercadopago.com/v1/payments` com:
  - `transaction_amount`: `total_cents / 100` (do banco, não do payload)
  - `token`, `payment_method_id`, `installments`, `payer` (repassados do Brick)
  - `external_reference`: `order_id`
  - `description`: nome da loja + id do pedido
  - header `X-Idempotency-Key`: UUID novo por tentativa (`crypto.randomUUID()`),
    evita cobrança duplicada em retry de rede.
- Mapeia o status retornado (`approved` → `paid`, `in_process`/`pending` → `pending`,
  `rejected` → `canceled`) usando a mesma função `mapMpStatus` que o webhook já tem —
  extrair para `supabase/functions/_shared/mp-status.ts` e importar nos dois lugares.
- Atualiza `orders` (`status`, `payment_status`, `mp_payment_id`, `paid_at` se aprovado).
- Retorna `{ status: 'paid'|'pending'|'canceled', order_id }` pro frontend decidir a
  página de destino. Erros do MP (cartão recusado etc.) voltam como
  `{ status: 'canceled', detail }` — o frontend mostra a mensagem e deixa tentar de novo
  sem perder o carrinho.

### `supabase/functions/webhook-mp/index.ts`
Sem alterações de lógica. Continua sendo a fonte de verdade assíncrona (principalmente
para Pix, que pode demorar a confirmar) — ele já reconsulta a API do MP pelo
`payment.id` e nunca confia no corpo da notificação, então funciona igual independente
de o pagamento ter sido criado via Brick.

Ajuste cosmético: se extrairmos `mapMpStatus` para `_shared/mp-status.ts`, o webhook
passa a importar de lá em vez de ter a função duplicada.

### Banco de dados
Nenhuma migração necessária. `mp_preference_id` (coluna existente) fica sem uso —
não precisa remover, só documentar. `mp_payment_id` e `payment_status` continuam sendo
preenchidos, agora por `process-payment` em vez de só pelo webhook.

### `js/config.js`
Adicionar `MP_PUBLIC_KEY` (chave pública do MercadoPago — diferente do Access Token,
pode ficar exposta no browser, é isso que o SDK do Brick exige para inicializar).

### `checkout.html`
No card "Pagamento":
- Remove o texto "Você será redirecionado..." e o botão único "Pagar com MercadoPago".
- Adiciona `<div id="paymentBrick_container"></div>`.
- Adiciona `<script src="https://sdk.mercadopago.com/js/v2"></script>` antes de `checkout.js`.
- Mantém a nota de segurança (ajustando o texto: dados de cartão continuam nunca tocando
  o servidor Druza — agora via tokenização do Brick em vez de redirect).

### `js/checkout.js`
- Função `pay()` atual (que chama `create-preference` e faz `location.href = init_point`)
  é substituída por:
  1. `createOrder()`: chama a function `create-order`, guarda `order_id` e `total_cents`.
  2. `mountBrick(total_cents)`: inicializa `new MercadoPago(window.DRUZA_CONFIG.MP_PUBLIC_KEY, { locale: 'pt-BR' })`,
     cria o Payment Brick no container com `initialization.amount = total_cents/100`,
     `initialization.payer.email` pré-preenchido com o e-mail da sessão logada,
     `customization.paymentMethods` limitando a `creditCard`, `debitCard` e `bankTransfer` (Pix).
  3. `onSubmit(formData)` do Brick: chama `process-payment` com `order_id` + `formData`,
     trata resposta:
     - `paid` → `location.href = 'pagamento-sucesso.html?order=' + order_id`
     - `pending` → `location.href = 'pagamento-pendente.html?order=' + order_id`
     - `canceled`/erro → mostra mensagem de erro no card (`setError`), deixa o Brick
       ativo pra nova tentativa (não recria o pedido — mesmo `order_id`).
  4. `onError(error)` do Brick (falha ao carregar/validar formulário): mostra mensagem
     genérica de erro, loga no console para depuração.
- Botão "Pagar" antigo (`els.payBtn`) é removido; o Brick tem seu próprio botão de submit.
- O card "Pagamento" ganha um botão explícito "Ir para pagamento" no lugar do antigo
  "Pagar com MercadoPago". Esse botão dispara `createOrder()` e só então `mountBrick()`
  substitui o botão pelo container do Brick. Isso evita criar pedidos "pending" órfãos
  a cada carregamento/refresh da página — `create-order` só roda uma vez, quando o
  cliente já revisou carrinho e endereço e decidiu seguir para pagamento.

## Fluxo de dados (passo a passo)

1. Cliente revisa carrinho/endereço em `checkout.html` (sem mudança).
2. Clica em algo como "Ir para pagamento" → `create-order` cria o pedido `pending` e
   devolve o total oficial.
3. Brick é montado com esse total, cliente escolhe cartão ou Pix.
4. Cartão: Brick tokeniza no iframe do MP → `onSubmit` dispara com `token` +
   `payment_method_id` + `installments`. Pix: `onSubmit` dispara sem `token`, com
   `payment_method_id: 'pix'`.
5. `process-payment` chama `/v1/payments`, atualiza o pedido, responde ao frontend.
6. Frontend redireciona para a página de resultado.
7. (Só para Pix/pendências) `webhook-mp` recebe a notificação assíncrona quando o Pix é
   pago e promove o pedido pra `paid` — o cliente vê isso em "Minha conta" mesmo que já
   tenha saído da página de pendente.

## Tratamento de erros

- **Cartão recusado**: MP retorna `rejected` com `status_detail` (ex: `cc_rejected_insufficient_amount`).
  `process-payment` repassa uma mensagem amigável; Brick permanece montado com o mesmo
  `order_id`, cliente tenta outro cartão sem duplicar o pedido.
- **Pix**: sempre volta `in_process`/`pending` no primeiro retorno — normal, não é erro.
  Frontend trata como sucesso-pendente (`pagamento-pendente.html`).
- **Falha de rede ao chamar `process-payment`**: pedido continua `pending` no banco (só
  criamos o payment no MP quando a chamada efetivamente chega); frontend mostra erro e
  permite tentar de novo — nova tentativa usa novo `X-Idempotency-Key`, então não há
  risco de cobrança duplicada por retry.
- **SDK do Brick falha ao carregar** (ex: bloqueio de rede/ad-blocker): `onError` mostra
  mensagem pedindo para desativar bloqueadores ou tentar novamente; sem fallback para
  Checkout Pro (removido por decisão do usuário).

## Segurança

Idêntico ao modelo atual em termos de PCI compliance: o número do cartão é tokenizado
no browser pelo iframe do MercadoPago (Brick), nunca trafega para o servidor Druza —
isso é o mesmo princípio do Checkout Pro, só que sem o redirect. O `MP_ACCESS_TOKEN`
continua exclusivamente em variáveis de ambiente das Edge Functions. A nova
`MP_PUBLIC_KEY` é, por definição, segura para expor no browser (é para isso que existe).

## Testes

Reaproveita os cartões de teste já documentados em `docs/MERCADOPAGO-SETUP.md`
(`APRO`/`OTHE`), agora exercitados dentro do checkout embutido em vez do domínio do MP.
Adicionar ao roteiro de teste:
- Aprovação de cartão dentro do Brick (sem redirect).
- Recusa de cartão → mensagem de erro → nova tentativa com outro cartão de teste,
  mesmo `order_id`.
- Pix simulado no ambiente de sandbox do MP → `pagamento-pendente.html` →
  confirmação via webhook → status `paid` em "Minha conta".
- Contas SEM login prévio no MercadoPago conseguem pagar (esse é o critério de aceite
  principal do pedido original).

## Fora de escopo (explicitamente adiado)

- Boleto bancário (fica para uma etapa futura, se necessário).
- Fallback automático para Checkout Pro em caso de falha do Brick.
- Migração/limpeza da coluna `mp_preference_id` (fica sem uso, sem remoção agora).

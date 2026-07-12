# Plano de implementação — Payment Brick checkout

Baseado em [2026-07-12-payment-brick-checkout-design.md](./2026-07-12-payment-brick-checkout-design.md).

## 1. Backend — `_shared/mp-status.ts`
- Criar `supabase/functions/_shared/mp-status.ts` exportando `mapMpStatus(mpStatus: string): string`
  (mesma lógica hoje duplicada implicitamente — extrair de `webhook-mp/index.ts`).
- Atualizar `webhook-mp/index.ts` para importar dali em vez de ter a função local.

## 2. Backend — `create-order` (novo, substitui `create-preference`)
- Criar `supabase/functions/create-order/index.ts`.
- Copiar de `create-preference/index.ts`: auth JWT, rate limit, validação de body,
  resolução de endereço (`address_id` ou `address` novo), recálculo de subtotal/desconto/
  frete/total a partir do catálogo, insert em `orders` (status `pending`) + `order_items`.
- Remover tudo relativo a `fetch('https://api.mercadopago.com/checkout/preferences', ...)`,
  `mp_preference_id`, `back_urls`.
- Retornar `json({ order_id: order.id, total_cents: total })`.
- Apagar `supabase/functions/create-preference/index.ts` (pasta inteira).

## 3. Backend — `process-payment` (novo)
- Criar `supabase/functions/process-payment/index.ts`.
- Auth JWT igual às outras functions.
- Body esperado: `{ order_id, token?, payment_method_id, installments?, payer, issuer_id? }`.
- Rebuscar `orders` por `id = order_id` e `user_id = auth.uid()` (via client com JWT,
  respeita RLS) — pegar `total_cents` oficial. 404 se não encontrar/não for do usuário.
- Chamar `POST https://api.mercadopago.com/v1/payments` com header
  `X-Idempotency-Key: crypto.randomUUID()`, body `{ transaction_amount: total_cents/100,
  token, payment_method_id, installments, payer, external_reference: order_id,
  description: 'Druza — pedido ' + order_id }`.
- Mapear resposta com `mapMpStatus` (de `_shared/mp-status.ts`).
- Atualizar `orders`: `status`, `payment_status`, `mp_payment_id`, `paid_at` (se `paid`).
- Responder `json({ status, order_id })`; em erro do MP, responder com o `status_detail`
  pra mensagem amigável no frontend.

## 4. Config — chave pública do MercadoPago
- Adicionar `MP_PUBLIC_KEY` em `js/config.js` (`window.DRUZA_CONFIG`).
- Documentar em `docs/MERCADOPAGO-SETUP.md` onde pegar a chave pública (mesma tela de
  credenciais, ao lado do Access Token) e que ela é segura para expor no browser.
- Atualizar o restante do `MERCADOPAGO-SETUP.md`: trocar menções a `create-preference`
  por `create-order` + `process-payment`, remover o passo de configurar `back_urls`/
  redirect, adicionar o passo de configurar `MP_PUBLIC_KEY` no `config.js` e o deploy
  das duas novas functions (`supabase functions deploy create-order`,
  `supabase functions deploy process-payment`).

## 5. Frontend — `checkout.html`
- No card "Pagamento": remover parágrafo "Você será redirecionado..." e o botão
  `#pay-btn` atual.
- Adicionar botão `#go-to-payment-btn` ("Ir para pagamento").
- Adicionar `<div id="paymentBrick_container" hidden></div>` abaixo do botão.
- Adicionar `<script src="https://sdk.mercadopago.com/js/v2"></script>` antes de
  `js/checkout.js`.
- Ajustar o texto da nota de segurança (dados de cartão tokenizados no browser, nunca
  tocam o servidor Druza).

## 6. Frontend — `js/checkout.js`
- Remover função `pay()` atual e o listener em `els.payBtn`.
- Adicionar:
  - `els.goToPaymentBtn`, `els.brickContainer` no objeto `els`.
  - `async function goToPayment()`: valida endereço (igual à validação hoje dentro de
    `pay()`), chama `create-order` via `A.invokeFunction('create-order', payload)`,
    guarda `orderId`/`totalCents`, esconde o botão, mostra o container do Brick, chama
    `mountBrick(totalCents)`.
  - `function mountBrick(totalCents)`: `const mp = new MercadoPago(window.DRUZA_CONFIG.MP_PUBLIC_KEY,
    { locale: 'pt-BR' })`; `mp.bricks().create('payment', 'paymentBrick_container', {
    initialization: { amount: totalCents / 100, payer: { email: <email da sessão> } },
    customization: { paymentMethods: { creditCard: 'all', debitCard: 'all', bankTransfer: ['pix'] } },
    callbacks: { onSubmit: handleBrickSubmit, onError: handleBrickError } })`.
  - `async function handleBrickSubmit(formData)`: chama `process-payment` com
    `{ order_id: orderId, ...formData }`; conforme `status` retornado, navega para
    `pagamento-sucesso.html?order=`, `pagamento-pendente.html?order=` ou mostra erro
    (`setError`) mantendo o Brick montado para nova tentativa.
  - `function handleBrickError(error)`: `console.error` + `setError('Não foi possível
    carregar o formulário de pagamento. Recarregue a página ou tente novamente.')`.
- Manter `A.getSession()` (precisa do e-mail pra `initialization.payer.email`).

## 7. Banco de dados
- Nenhuma migração. Confirmar que a policy `orders_insert_own_pending` (já existe em
  `schema-payments.sql`) cobre o insert feito por `create-order` (mesmo padrão de hoje).

## 8. Limpeza de docs
- `README.md`, `docs/GUIA-DE-PRODUCAO.md`, `docs/SEGURANCA.md`, `docs/BACKEND-SETUP.md`:
  grep por `create-preference`/`init_point` e atualizar referências para o novo fluxo.

## 9. Testes manuais (checklist, via dev server local)
1. Fluxo cartão aprovado (`APRO`, cartão de teste Mastercard) — sem sair de `checkout.html`.
2. Fluxo cartão recusado (`OTHE` ou cartão "Recusado" da tabela) — mensagem de erro,
   Brick continua montado, nova tentativa com cartão aprovado funciona (mesmo `order_id`).
3. Fluxo Pix — vai para `pagamento-pendente.html`, webhook confirma depois, status
   `paid` aparece em "Minha conta".
4. Confirmar que nenhuma etapa exige login/conta no MercadoPago — só no site da Druza.
5. Refresh da página de checkout antes de clicar "Ir para pagamento" não cria pedido
   órfão (só cria ao clicar).

## Ordem de execução sugerida
1 → 2 → 3 (backend primeiro, testável via `supabase functions serve` + curl)
4 → 5 → 6 (frontend)
7 (conferir, sem mudança esperada)
8 (docs)
9 (teste ponta a ponta)

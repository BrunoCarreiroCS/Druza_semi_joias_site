# MercadoPago + Supabase Edge Functions — Setup

Este guia configura o pagamento real do site Druza usando **Payment Brick**
(checkout transparente/embutido): o cliente paga com cartão ou Pix sem sair
do site e **sem precisar ter conta no MercadoPago**.
**Tempo estimado:** 30-45 min.

A arquitetura é:

```
Browser → Edge Function "create-order" → cria pedido (pending), recalcula
        totais do catálogo. NÃO fala com o MercadoPago.
       ← retorna { order_id, total_cents }
Browser → monta o Payment Brick (SDK js/v2) dentro de checkout.html com
        esse total. Cliente digita cartão (tokenizado no browser) ou Pix.
Browser → Edge Function "process-payment" → cobra via POST /v1/payments
        (Access Token secreto) → atualiza o pedido → responde status
       ← Browser navega para pagamento-sucesso/pendente/falha.html

MercadoPago → POST webhook-mp (reconsulta a API, nunca confia no corpo)
            → confirma/atualiza status=paid (principalmente para Pix)
```

---

## Passo 1 — Conta MercadoPago

1. Crie conta em **mercadopago.com.br** (use a conta da Druza)
2. Acesse **Seu negócio → Configurações → Gestão e administração → Credenciais**
3. Você verá dois conjuntos de credenciais:
   - **Credenciais de teste** (`TEST-...`) — para testar sem dinheiro real
   - **Credenciais de produção** (`APP_USR-...`) — para vendas reais
4. **Copie o "Access Token" E a "Public Key"** das credenciais de teste
   (vamos começar testando). O Access Token é secreto (só servidor); a
   Public Key é feita pra ficar exposta no browser — é ela que o Payment
   Brick usa pra inicializar.

> ⚠️ Nunca exponha o Access Token no browser. Ele fica só no servidor.
> A Public Key (`TEST-...`/`APP_USR-...`, formato diferente do Access
> Token) é segura para expor — vai em `js/config.js` (Passo 6).

---

## Passo 2 — Atualizar o banco

No **SQL Editor do Supabase**, rode o arquivo `db/schema-payments.sql`
(adiciona colunas `mp_preference_id`, `mp_payment_id` e políticas de INSERT).

---

## Passo 3 — Instalar Supabase CLI

No PowerShell:

```powershell
# Via Scoop (recomendado no Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# OU via npm
npm i -g supabase
```

Verifique:
```powershell
supabase --version
```

---

## Passo 4 — Conectar o CLI ao seu projeto

```powershell
# Faz login (abre o navegador)
supabase login

# Linka esta pasta ao seu projeto Druza
cd C:\Users\KABUM\Desktop\Druza_site
supabase link --project-ref hqkpgghlbwincahfwkem
```

> Use a senha do banco que você criou no Passo 1 do BACKEND-SETUP.

---

## Passo 5 — Configurar os secrets (variáveis de ambiente)

```powershell
# Token do MercadoPago (de teste por enquanto)
supabase secrets set MP_ACCESS_TOKEN=TEST-1234567890-abc...

# Secret do webhook — vamos definir no Passo 7. Por ora coloque um placeholder:
supabase secrets set MP_WEBHOOK_SECRET=placeholder-trocar-no-passo-7
```

> `PUBLIC_SITE_URL` não é mais necessária: o Payment Brick não usa
> `back_urls` (não há redirect para o MP). Se você configurou esse secret
> numa instalação antiga, pode removê-lo com `supabase secrets unset PUBLIC_SITE_URL`.

> O `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são definidos automaticamente.

---

## Passo 6 — Chave pública no frontend + deploy das Edge Functions

Edite `js/config.js` e troque `MP_PUBLIC_KEY` pela Public Key copiada no Passo 1:

```js
window.DRUZA_CONFIG = {
  SUPABASE_URL: '...',
  SUPABASE_ANON_KEY: '...',
  MP_PUBLIC_KEY: 'TEST-sua-chave-publica-aqui'
};
```

Depois, deploy das functions:

```powershell
# Cria o pedido (valida carrinho/endereço, recalcula totais) — sem falar com o MP
supabase functions deploy create-order

# Cobra o pedido via Payment Brick (recebe os dados tokenizados do Brick)
supabase functions deploy process-payment

# Webhook do MercadoPago (precisa --no-verify-jwt, pois o MP não tem JWT do Supabase)
supabase functions deploy webhook-mp --no-verify-jwt
```

Você verá as URLs públicas das funções:
```
https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/create-order
https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/process-payment
https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/webhook-mp
```

---

## Passo 7 — Configurar o webhook no MercadoPago

1. Volte ao painel do MP → **Suas integrações → Webhooks → Configurar notificações**
2. Em **URL para receber notificações**, cole:
   ```
   https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/webhook-mp
   ```
3. Em **Eventos**, marque apenas **"Pagamentos"**
4. Salve. O MP vai mostrar uma **chave secreta** (algo como `e83...`)
5. Copie a chave e atualize o secret no Supabase:
   ```powershell
   supabase secrets set MP_WEBHOOK_SECRET=e83...sua-chave-real-aqui
   ```
6. **Faça redeploy** do webhook para pegar a nova secret:
   ```powershell
   supabase functions deploy webhook-mp --no-verify-jwt
   ```

---

## Passo 8 — Testar fluxo completo

1. Abra o site (`http://localhost:5510`)
2. Faça login com a conta de teste
3. Adicione uma peça ao carrinho → clique **"Finalizar compra"**
4. Na página de checkout, preencha o endereço e clique **"Ir para pagamento"**
   — o formulário do Payment Brick aparece **dentro da própria página**,
   sem redirect e sem exigir login/conta no MercadoPago
5. Preencha com **cartões de teste**:

   | Bandeira | Número | CVV | Validade | Resultado |
   |----------|--------|-----|----------|-----------|
   | Mastercard | 5031 4332 1540 6351 | 123 | 11/30 | Aprovado |
   | Visa | 4235 6477 2802 5682 | 123 | 11/30 | Aprovado |
   | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 | Recusado |

   Nome no cartão: `APRO` (aprovado) ou `OTHE` (outro erro)
   CPF: `12345678909`

6. Teste também o **Pix** (opção "Transferência bancária" no Brick) — o MP
   sandbox simula a aprovação; você deve cair em `pagamento-pendente.html`
7. Teste um cartão **recusado**: a mensagem de erro aparece no próprio
   card de pagamento e o Brick continua montado — tente de novo com um
   cartão aprovado e confirme que funciona sem recriar o pedido
8. Após aprovar, você vai para `pagamento-sucesso.html`
9. Acesse **Minha conta** → o pedido deve aparecer com status **Pago**
   (imediato para cartão aprovado; para Pix, após o webhook chegar, em
   poucos segundos)

---

## Passo 9 — Ir para produção (quando estiver tudo OK)

1. No painel MP, copie as credenciais de **produção** (`APP_USR-...`)
2. Atualize os secrets:
   ```powershell
   supabase secrets set MP_ACCESS_TOKEN=APP_USR-sua-chave-prod
   supabase secrets set PUBLIC_SITE_URL=https://druza.com.br
   ```
3. Troque `MP_PUBLIC_KEY` em `js/config.js` pela Public Key de produção.
4. Redeploy:
   ```powershell
   supabase functions deploy create-order
   supabase functions deploy process-payment
   supabase functions deploy webhook-mp --no-verify-jwt
   ```
5. Configure também o webhook de produção no painel MP (mesma URL — já está em produção, era só de teste antes).

---

## Solução de problemas

**"Invalid signature" no webhook**
→ A `MP_WEBHOOK_SECRET` não bate. Recopie do painel MP e redeploy.

**"Configuração ausente" no browser**
→ Falta `js/config.js`. Veja `BACKEND-SETUP.md`.

**"Não autenticado" ao clicar em "Ir para pagamento"**
→ Sessão expirou. Faça logout e login novamente.

**Pedido fica "Aguardando" mesmo após pagar no Pix**
→ Webhook não chegou. Veja os logs:
```powershell
supabase functions logs webhook-mp --tail
```

**Erro no `create-order` ou no `process-payment`**
→ Veja os logs:
```powershell
supabase functions logs create-order --tail
supabase functions logs process-payment --tail
```

**Formulário do Payment Brick não carrega / fica em branco**
→ Confira se `MP_PUBLIC_KEY` está preenchida em `js/config.js` e se o
script `https://sdk.mercadopago.com/js/v2` está sendo carregado antes de
`js/checkout.js` (veja o console do navegador).

**Em modo teste só posso usar o cartão da própria conta**
→ Para testar com outras contas, crie uma **conta de teste** no MP:
   `Seu negócio → Integrações → Teste integradores → Criar usuário de teste`

---

## Estrutura de arquivos relevante

```
db/
  schema-payments.sql                # rodar no SQL Editor (Passo 2)

supabase/
  functions/
    _shared/mp-status.ts             # mapMpStatus, usado por process-payment e webhook-mp
    create-order/index.ts            # deployed no Passo 6 — cria o pedido
    process-payment/index.ts         # deployed no Passo 6 — cobra via Brick
    webhook-mp/index.ts              # deployed no Passo 6 (--no-verify-jwt)

checkout.html                        # página do checkout (Payment Brick embutido)
pagamento-sucesso.html               # destino após pagamento aprovado
pagamento-pendente.html              # destino para Pix aguardando confirmação
pagamento-falha.html                 # destino em caso de erro
js/checkout.js                       # lógica do frontend de checkout
js/auth.js                           # invokeFunction helper
```

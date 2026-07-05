# MercadoPago + Supabase Edge Functions — Setup

Este guia configura o pagamento real do site Druza.
**Tempo estimado:** 30-45 min.

A arquitetura é:

```
Browser → Edge Function "create-preference" → cria pedido + preferência MP
       ← retorna init_point
Browser → checkout MercadoPago → paga → volta para pagamento-sucesso.html

MercadoPago → POST webhook-mp (verifica HMAC) → atualiza status=paid
```

---

## Passo 1 — Conta MercadoPago

1. Crie conta em **mercadopago.com.br** (use a conta da Druza)
2. Acesse **Seu negócio → Configurações → Gestão e administração → Credenciais**
3. Você verá dois conjuntos de credenciais:
   - **Credenciais de teste** (`TEST-...`) — para testar sem dinheiro real
   - **Credenciais de produção** (`APP_USR-...`) — para vendas reais
4. **Copie o "Access Token"** das credenciais de teste (vamos começar testando)

> ⚠️ Nunca exponha o Access Token no browser. Ele fica só no servidor.

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

# URL pública do site (use http://localhost:5510 em dev; https://druza.com.br em produção)
supabase secrets set PUBLIC_SITE_URL=http://localhost:5510

# Secret do webhook — vamos definir no Passo 7. Por ora coloque um placeholder:
supabase secrets set MP_WEBHOOK_SECRET=placeholder-trocar-no-passo-7
```

> O `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são definidos automaticamente.

---

## Passo 6 — Deploy das Edge Functions

```powershell
# Função que cria o pedido + preferência (validada por JWT do user)
supabase functions deploy create-preference

# Webhook do MercadoPago (precisa --no-verify-jwt, pois o MP não tem JWT do Supabase)
supabase functions deploy webhook-mp --no-verify-jwt
```

Você verá as URLs públicas das funções:
```
https://hqkpgghlbwincahfwkem.supabase.co/functions/v1/create-preference
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
4. Na página de checkout, preencha o endereço e clique **"Pagar com MercadoPago"**
5. No checkout do MP (modo teste), use **cartões de teste**:

   | Bandeira | Número | CVV | Validade | Resultado |
   |----------|--------|-----|----------|-----------|
   | Mastercard | 5031 4332 1540 6351 | 123 | 11/30 | Aprovado |
   | Visa | 4235 6477 2802 5682 | 123 | 11/30 | Aprovado |
   | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 | Recusado |

   Nome no cartão: `APRO` (aprovado) ou `OTHE` (outro erro)
   CPF: `12345678909`

6. Após pagar, você volta para `pagamento-sucesso.html`
7. Acesse **Minha conta** → o pedido deve aparecer com status **Pago** (após o webhook chegar, em poucos segundos)

---

## Passo 9 — Ir para produção (quando estiver tudo OK)

1. No painel MP, copie as credenciais de **produção** (`APP_USR-...`)
2. Atualize os secrets:
   ```powershell
   supabase secrets set MP_ACCESS_TOKEN=APP_USR-sua-chave-prod
   supabase secrets set PUBLIC_SITE_URL=https://druza.com.br
   ```
3. Redeploy:
   ```powershell
   supabase functions deploy create-preference
   supabase functions deploy webhook-mp --no-verify-jwt
   ```
4. Configure também o webhook de produção no painel MP (mesma URL — já está em produção, era só de teste antes).

---

## Solução de problemas

**"Invalid signature" no webhook**
→ A `MP_WEBHOOK_SECRET` não bate. Recopie do painel MP e redeploy.

**"Configuração ausente" no browser**
→ Falta `js/config.js`. Veja `BACKEND-SETUP.md`.

**"Não autenticado" ao clicar Pagar**
→ Sessão expirou. Faça logout e login novamente.

**Pedido fica "Aguardando" mesmo após pagar**
→ Webhook não chegou. Veja os logs:
```powershell
supabase functions logs webhook-mp --tail
```

**Erro no `create-preference`**
→ Veja os logs:
```powershell
supabase functions logs create-preference --tail
```

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
    create-preference/index.ts       # deployed no Passo 6
    webhook-mp/index.ts              # deployed no Passo 6 (--no-verify-jwt)

checkout.html                        # página do checkout
pagamento-sucesso.html               # back_url success
pagamento-pendente.html              # back_url pending
pagamento-falha.html                 # back_url failure
js/checkout.js                       # lógica do frontend de checkout
js/auth.js                           # invokeFunction helper
```

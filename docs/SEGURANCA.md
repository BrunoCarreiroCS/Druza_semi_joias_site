# Segurança — Druza Semi Joias

Mapa das camadas de segurança do site, o raciocínio por trás de cada uma, e o
checklist do que ativar ao ir para produção.

**Princípio geral:** o navegador é território do usuário — qualquer coisa que roda
nele pode ser lida e adulterada. Por isso, **nenhuma decisão sensível é tomada no
front-end**: preço, autorização, status de pagamento e permissão de admin são
sempre decididos/revalidados no servidor (Edge Functions + RLS do Postgres).

---

## 1. Camadas existentes

### 1.1 Dados (Postgres + RLS)

- **RLS ativo em todas as tabelas.** Cliente só lê/escreve as próprias linhas
  (`profiles`, `addresses`, `orders`, `order_items`).
- **`products`**: leitura pública só de produtos `active = true`; **nenhuma
  escrita via client** — só as Edge Functions admin (service_role) escrevem.
- **`admins`**: só `select` da própria linha. **Zero política de escrita** — não
  existe caminho pelo site para virar admin; promoção é manual, no SQL Editor.
  (Por isso não usamos um boolean `is_admin` em `profiles`: lá o usuário pode
  editar a própria linha, o que abriria auto-promoção.)
- **`admin_audit_log`**: nenhum acesso via client; toda ação administrativa de
  escrita é registrada (quem, quando, o quê) pelas Edge Functions.

### 1.2 Pagamento (MercadoPago)

- **Preço nunca vem do navegador**: `create-preference` recalcula subtotal,
  frete, cupom e total a partir da tabela `products` no servidor.
- **Webhook não confia na notificação**: `webhook-mp` pega o id do pagamento e
  **re-consulta a API do MP** com o nosso Access Token (só devolve pagamentos da
  nossa conta) + **confere o valor pago** contra o total do pedido antes de
  marcar "pago". HMAC da assinatura é camada extra best-effort (o ambiente do MP
  assina inconsistentemente — ver histórico no repositório de memória).
- Dados de cartão **nunca** passam pelo nosso código (PCI fica no MP).

### 1.3 Painel administrativo

- **Login dedicado** (`admin-login.html`) + **2FA TOTP obrigatório** (app
  autenticador). O enrolamento é forçado no primeiro acesso.
- **A trava é no servidor**: `_shared/require-admin.ts` valida o JWT, confirma a
  presença na tabela `admins` **e exige o claim `aal2`** (2FA verificado na
  sessão). Sem isso, toda Edge Function admin devolve 403 — adulterar o
  JavaScript do painel não dá acesso a nada.
- **Autorização centralizada**: todas as 6 funções admin passam pelo mesmo
  `requireAdmin()` — um único lugar para auditar, um único lugar para errar.

### 1.4 Front-end

- **Escape de HTML** (`esc()`) em toda interpolação de dados dinâmicos em
  `innerHTML` (conta, checkout, admin, catálogo) — anti-XSS.
- **supabase-js pinado com SRI**: as páginas carregam versão exata
  (`@2.45.0`) com hash `integrity` — se o CDN for comprometido ou o arquivo
  mudar, o navegador bloqueia o script em vez de executá-lo.
- **`js/config.js` gitignored** — só URL + anon key no client (públicas por
  design; a segurança vem do RLS). Service_role **jamais** aparece no front.
- Páginas de conta/admin com `noindex`.

### 1.5 Edge Functions

- **Validação de entrada em todas**: slug com formato estrito
  (`^[a-z0-9]+(-[a-z0-9]+)*$`), caps de tamanho em nome/categoria/endereço/
  rastreio, teto de preço, carrinho limitado a 30 linhas, status de pedido
  contra whitelist.
- **CORS restringível**: `_shared/cors.ts` lê a env `ALLOWED_ORIGIN`. Sem ela,
  usa `*` (necessário em dev, com ngrok mudando de URL); em produção, defina a
  origem única (ver checklist).
- **Rate limiting por IP** (`_shared/rate-limit.ts`): create-preference 10/min,
  escritas admin 30/min, leituras admin 60/min. É um amortecedor em memória
  (zera em cold start, não é global entre instâncias) — barra rajadas óbvias
  de brute-force/abuso; limite forte global fica como upgrade (§4). O
  webhook-mp fica de fora de propósito (o MP manda rajadas legítimas).

### 1.6 Independência de terceiros

- **Fontes auto-hospedadas** (`fonts/` + `css/fonts.css`): nenhuma requisição
  ao Google Fonts — menos um terceiro para confiar, melhor privacidade dos
  visitantes (LGPD) e menos handshakes TLS no carregamento.
- O único código de terceiro que resta no front é o supabase-js — pinado com
  SRI (ver 1.4).

---

## 2. Checklist de produção (fazer ao publicar)

1. **Restringir CORS**:
   ```bash
   supabase secrets set ALLOWED_ORIGIN=https://druza.com.br
   # redeploy de todas as functions depois
   ```
2. **Trocar credenciais MP** de teste → produção (`MP_ACCESS_TOKEN`) e revalidar
   o fluxo com um pagamento real de valor baixo.
3. **`PUBLIC_SITE_URL`** → domínio real (hoje aponta para o túnel de teste).
4. **Headers de segurança no host** (configuração do servidor/CDN onde o site
   estático for publicado — não dá para fazer via HTML):
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY` (ou CSP `frame-ancestors 'none'`)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - CSP completa é desejável, mas exige mover os scripts inline das páginas
     para arquivos próprios primeiro (ver ideias futuras).
5. **Supabase Auth**: conferir senha mínima ≥ 8, confirmação de e-mail ativa,
   e **Redirect URLs** limitadas ao domínio real (remover ngrok/localhost).
6. **Backups**: ativar/verificar backup automático do banco no plano do Supabase.
7. **Revisar quem está em `admins`** (deve ser só o dono) e testar o fluxo 2FA
   completo no domínio final.

---

## 3. Resposta a incidentes (o básico)

- **Perdeu o celular do 2FA** → remover o fator em Authentication → Users (ou
  `delete from auth.mfa_factors where user_id = ...`) e reenrolar. O Supabase
  Studio é sempre o acesso de última instância do dono.
- **Suspeita de conta admin comprometida** → trocar a senha, remover o fator
  MFA antigo, e consultar `admin_audit_log` para ver o que foi feito.
- **Vazamento de secret** (Access Token MP, service_role) → rotacionar no painel
  correspondente (MP / Supabase) e `supabase secrets set` de novo + redeploy.
- **Pagamento suspeito** → conferir no painel do MP; o pedido só marca "pago"
  se o valor bateu, então divergência aparece no log da function (`Amount
  mismatch`).

---

## 4. Reforços futuros (em ordem de valor)

1. **CSP estrita** — mover scripts inline para arquivos e publicar uma
   `Content-Security-Policy` com nonces; elimina de vez a classe XSS.
2. **Rate limiting forte/global** — persistir contadores em tabela ou usar
   serviço dedicado (o atual, em memória, zera em cold start e não é
   compartilhado entre instâncias).
3. **Códigos de backup do 2FA** — alternativa ao celular perdido sem passar
   pelo Studio.
4. **Alertas** — notificação (e-mail) para eventos sensíveis: novo admin,
   rajada de erros 401/403, divergência de valor no webhook.
5. **Monitoramento de erros** (ex.: Sentry) no front e nas functions.
6. **Auto-hospedar o supabase-js** — último terceiro do front (hoje mitigado
   por versão pinada + SRI).

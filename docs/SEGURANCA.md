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

- **RLS ativo em todas as tabelas.** Cliente lê apenas o próprio perfil,
  endereços, pedidos e itens; só atualiza os campos pessoais e endereços
  permitidos. Pedidos e itens são inseridos exclusivamente pela RPC protegida.
- **Cadastro endurecido em duas camadas.** O front valida e normaliza nome,
  e-mail, telefone brasileiro com DDD, data de nascimento 18+ e senha forte;
  o banco repete as travas em `profiles` via constraints/triggers, então
  chamadas diretas ao Supabase também são bloqueadas.
- **Perfis legados incompletos não compram.** Um trigger independente bloqueia
  qualquer novo pedido até o titular completar nome, telefone válido e data de
  nascimento na área da conta. Nenhum dado antigo é inventado ou sobrescrito.
- **Controle de colunas em `profiles`.** O cliente autenticado pode atualizar
  apenas `full_name`, `phone`, `birth_date` e `marketing_consent`; campos como
  `payment_customer_id`, `consent_date`, `created_at` e `updated_at` ficam fora
  do alcance do navegador.
- **`products`**: leitura pública só de produtos `active = true`; **nenhuma
  escrita via client** — só as Edge Functions admin (service_role) escrevem.
- **`admins`**: só `select` da própria linha. **Zero política de escrita** — não
  existe caminho pelo site para virar admin; promoção é manual, no SQL Editor.
  (Por isso não usamos um boolean `is_admin` em `profiles`: lá o usuário pode
  editar a própria linha, o que abriria auto-promoção.)
- **`admin_audit_log`**: nenhum acesso via client; toda ação administrativa de
  escrita é registrada (quem, quando, o quê) pelas Edge Functions.

### 1.2 Pagamento (MercadoPago Payment Brick)

- **Preço nunca vem do navegador**: `create-order` chama uma RPC transacional
  que recalcula subtotal, frete, cupom e total, grava o snapshot e reserva
  estoque com lock nas linhas de `products`;
  `process-payment` cobra o valor gravado no pedido, nunca um valor vindo
  do payload da chamada.
- **Claim e idempotencia atomicos**: `process-payment` conquista `pending ->
  processing` sob lock e persiste uma chave por tentativa. Chamadas simultaneas
  reutilizam o mesmo `X-Idempotency-Key` e apenas uma cobranca vence.
- **Webhook não confia na notificação**: `webhook-mp` pega o id do pagamento e
  **re-consulta a API do MP** com o nosso Access Token (só devolve pagamentos da
  nossa conta), exige HMAC valido, confere `external_reference` e compara o valor
  em centavos inteiros. Replays ficam no ledger e viram `no-op`.
- **Maquina de estados por whitelist** impede downgrade por evento atrasado.
  Tentativas presas sao reconsultadas pelo job a cada cinco minutos.
- Numero do cartao e CVV nunca chegam ao nosso servidor: o Payment Brick os
  tokeniza no iframe. A Edge recebe apenas o token temporario e nao o registra.

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
- **`js/config.public.js` versionado** — contém só URL e chaves públicas do
  navegador. Service_role, Access Token e secrets **jamais** aparecem no front.
- Páginas de conta/admin com `noindex`.

### 1.5 Edge Functions

- **Validação de entrada em todas**: slug com formato estrito
  (`^[a-z0-9]+(-[a-z0-9]+)*$`), caps de tamanho em nome/categoria/endereço/
  rastreio, teto de preço, carrinho limitado a 30 linhas, status de pedido
  contra whitelist.
- **CORS restrito**: `_shared/cors.ts` aceita apenas Druza, `www` e a origem do
  GitHub Pages, mais a lista opcional `ALLOWED_ORIGINS`. Nao existe fallback `*`.
- **Rate limiting em duas camadas**: amortecedor por IP no isolate e contador
  duravel por usuario no Postgres para criar pedido/cobrar. Cold start nao
  reinicia o limite global.

### 1.6 Independência de terceiros

- **Fontes auto-hospedadas** (`fonts/` + `css/fonts.css`): nenhuma requisição
  ao Google Fonts — menos um terceiro para confiar, melhor privacidade dos
  visitantes (LGPD) e menos handshakes TLS no carregamento.
- Os SDKs de terceiro restantes são `supabase-js`, pinado com SRI, e o SDK
  oficial do Mercado Pago, carregado somente no checkout. O servidor nunca
  confia no resultado do SDK: pagamento, valor e referência são revalidados.

---

## 2. Checklist de produção (fazer ao publicar)

1. **Restringir CORS**:
   ```bash
   supabase secrets set ALLOWED_ORIGINS=https://druza.com.br,https://www.druza.com.br
   # redeploy de todas as functions depois
   ```
2. **Trocar credenciais MP** de teste → produção (`MP_ACCESS_TOKEN` e
   `MP_PUBLIC_KEY` em `js/config.public.js`) e revalidar o fluxo com um pagamento
   real de valor baixo.
3. **Headers de segurança no host** (configuração do servidor/CDN onde o site
   estático for publicado — não dá para fazer via HTML):
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY` (ou CSP `frame-ancestors 'none'`)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - CSP completa é desejável, mas exige mover os scripts inline das páginas
     para arquivos próprios primeiro (ver ideias futuras).
4. **Supabase Auth**: conferir senha mínima ≥ 8, exigir maiúscula, minúscula,
   número e símbolo, ativar proteção contra senhas vazadas quando o plano
   permitir, manter confirmação de e-mail ativa, e **Redirect URLs** limitadas
   ao domínio real (remover ngrok/localhost).
5. **Backups**: ativar/verificar backup automático do banco no plano do Supabase.
6. **Revisar quem está em `admins`** (deve ser só o dono) e testar o fluxo 2FA
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
2. **Observabilidade do rate limit** — alertar quando o contador durável indicar
   rajadas por usuário/origem e definir retenção operacional para as métricas.
3. **Códigos de backup do 2FA** — alternativa ao celular perdido sem passar
   pelo Studio.
4. **Alertas** — notificação (e-mail) para eventos sensíveis: novo admin,
   rajada de erros 401/403, divergência de valor no webhook.
5. **Monitoramento de erros** (ex.: Sentry) no front e nas functions.
6. **Supply chain do checkout** — manter o domínio oficial do SDK do Mercado
   Pago na CSP, acompanhar mudanças do provedor e avaliar pinagem quando houver
   uma distribuição oficialmente versionada compatível.

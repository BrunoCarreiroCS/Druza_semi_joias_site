# Druza — Setup do Backend (Fase 4b + 4c)

Sistema de **login, conta e histórico de pedidos** usando **Supabase** (banco
PostgreSQL + autenticação + Row Level Security). O site continua estático: não
precisa de servidor próprio para login/conta. Servidor só entra na **Fase 4d**
(webhook de pagamento).

> ⚠️ Você precisa criar a conta no Supabase — eu (assistente) não posso criar
> contas nem autenticar por você. Siga os passos abaixo; leva ~15 minutos.

---

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com e crie uma conta (plano Free serve para começar).
2. **New project** → nome `druza`, defina uma senha de banco forte (guarde-a).
3. Região: escolha **South America (São Paulo)** para menor latência.
4. Aguarde ~2 min até o projeto provisionar.

## 2. Rodar o schema do banco

1. No painel do projeto → **SQL Editor** → **New query**.
2. Cole todo o conteúdo de [`db/schema.sql`](../db/schema.sql) e clique **Run**.
3. Confirme em **Table Editor** que apareceram: `profiles`, `addresses`,
   `orders`, `order_items`.
4. Rode `db/schema-payments.sql`, `db/schema-admin.sql` e por ultimo
   [`db/security-final-hardening.sql`](../db/security-final-hardening.sql).
5. Para o reconciliador, use esta ordem fail-closed:
   - configure o mesmo valor aleatorio somente no Edge secret
     `RECONCILE_CRON_HMAC_SECRET_CURRENT` e no item de Vault
     `druza_reconcile_cron_hmac`, sem copiar o valor para arquivos ou comandos;
   - rode [`db/schedule-payment-reconciliation.sql`](../db/schedule-payment-reconciliation.sql)
     para assinar o cron;
   - publique imediatamente `reconcile-stale-payments` com o
     `verify_jwt = false` declarado em `supabase/config.toml`;
   - aguarde duas execucoes naturais e valide
     [`db/schedule-payment-reconciliation-smoke-test.sql`](../db/schedule-payment-reconciliation-smoke-test.sql).

O JWT do gateway fica desativado somente porque o handler valida HMAC-SHA256,
timestamp, caminho, metodo e corpo antes de carregar chaves administrativas.
Nao chame o endpoint nem RPCs de reconciliacao manualmente para testar.

Na rotacao, primeiro configure no Edge
`RECONCILE_CRON_HMAC_SECRET_PREVIOUS=<valor-antigo>` e
`RECONCILE_CRON_HMAC_SECRET_CURRENT=<valor-novo>`; depois atualize a entrada
existente do Vault para o valor novo, sem criar nome duplicado. Remova
`PREVIOUS` apenas depois de duas execucoes naturais validas. Em falha, desative
o job com `cron.alter_job(job_id := <jobid>, active := false)` e mantenha o
handler autenticado publicado.

> Se `security-final-hardening.sql` já havia sido aplicado antes de 17/07/2026,
> rode também [`db/enforce-checkout-profile-completion.sql`](../db/enforce-checkout-profile-completion.sql)
> e [`db/use-brazil-date-for-age-validation.sql`](../db/use-brazil-date-for-age-validation.sql).
> A migração preserva perfis antigos e apenas impede novos pedidos até o titular
> completar os dados obrigatórios em `conta.html`.

> Se o banco ja existia antes do endurecimento de cadastro, rode tambem
> [`db/security-signup-hardening.sql`](../db/security-signup-hardening.sql). Ele
> adiciona `birth_date`, telefone obrigatorio, maioridade 18+, controle de
> colunas em `profiles` e policies/grants mais restritos sem apagar usuarios
> antigos.

## 3. Configurar autenticação

No painel → **Authentication**:

- **Providers → Email**: deixe habilitado. Mantenha **Confirm email** LIGADO
  (segurança: evita cadastro com e-mail de terceiros).
- **Password security**: use minimo de 8 caracteres e exija maiuscula,
  minuscula, numero e simbolo. Se o plano permitir, ative protecao contra
  senhas vazadas.
- **Secure email change**, **Secure password change** e **Require current
  password when updating**: mantenha ligados.
- **Captcha protection**: opcionalmente conecte Cloudflare Turnstile e coloque
  a Site Key publica em `js/config.public.js`. O secret fica apenas no Auth.
- **URL Configuration → Site URL**: a URL do site (ex.: `https://druza.com.br`
  ou, em testes locais, `http://localhost:5510`).
- **Redirect URLs**: adicione:
  - `https://druza.com.br/login.html`
  - `https://druza.com.br/redefinir-senha.html`
  - `https://brunocarreirocs.github.io/Druza_semi_joias_site/**`
  - (e as versões `http://localhost:5510/...` enquanto testa local)
- **Email Templates** (opcional agora): personalize os e-mails de confirmação e
  de recuperação com a marca Druza.

> O Supabase já envia os e-mails de confirmação e recuperação. Em produção, com
> volume, configure um SMTP próprio (ex.: Resend) em **Project Settings → Auth → SMTP**.

## 4. Conectar o site às chaves

1. No painel → **Project Settings → API**, copie:
   - **Project URL**
   - **anon public** key (pode ficar no navegador — o RLS protege os dados).
2. Edite apenas a configuracao publica versionada:
   ```
   js/config.public.js
   ```
   ```js
   window.DRUZA_CONFIG = Object.freeze({
     SUPABASE_URL: 'https://xxxx.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...'   // anon public
   });
   ```
3. URL, chave publishable/anon, MP Public Key e Turnstile Site Key sao publicas.
4. **Nunca** use a chave `service_role` no navegador — ela ignora o RLS. Ela só
   vive no servidor de pagamento (Fase 4d).

## 5. Testar

1. Suba o site local (preview na porta 5510) e abra `cadastro.html`.
2. Crie uma conta → confira o e-mail de confirmação → confirme.
3. Faça login em `login.html` → você cai em `conta.html`.
4. Teste `recuperar-senha.html` → link no e-mail → `redefinir-senha.html`.

---

## Arquivos desta fase

| Arquivo | Papel |
|---|---|
| `db/schema.sql` | Tabelas + RLS + triggers (rode no Supabase) |
| `js/config.public.js` | Configuracao publica carregada pelo site estatico |
| `js/auth.js` | Camada de auth (signup, login, reset, perfil, pedidos) |
| `css/account.css` | Estilos de auth e da conta |
| `cadastro.html` | Criar conta (com consentimento LGPD) |
| `login.html` | Entrar |
| `recuperar-senha.html` | Solicitar link de recuperação |
| `redefinir-senha.html` | Definir nova senha (após link do e-mail) |
| `conta.html` | Painel: dados, endereços, histórico de pedidos |

## Segurança e LGPD (já contemplados)

- **RLS em todas as tabelas**: cada usuário só acessa os próprios dados.
- **Confirmação de e-mail** ligada: impede cadastro com e-mail alheio.
- **Anti-enumeração**: a tela de recuperação não revela se um e-mail existe.
- **Consentimento explícito** de marketing no cadastro, com data registrada.
- **Telefone obrigatório**, data de nascimento obrigatória e bloqueio de menores
  de 18 anos no front e no banco.
- **Senhas** nunca trafegam/armazenam em texto — o Supabase faz hash (bcrypt).
- **Sem dados de cartão** no banco: pagamento será tokenizado pelo gateway (4d).

## Ainda NÃO incluído (próximas fases)

- **4a deploy**: publicar o site + (depois) o servidor de pagamento.
- **4d pagamento**: integração com gateway (MercadoPago/Stripe), criação de
  pedido real e webhook que muda o status para `paid`.
- Edição de endereços pela conta (CRUD na tela — hoje a leitura já funciona).

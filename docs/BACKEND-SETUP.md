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
- **URL Configuration → Site URL**: a URL do site (ex.: `https://druza.com.br`
  ou, em testes locais, `http://localhost:5510`).
- **Redirect URLs**: adicione:
  - `https://druza.com.br/login.html`
  - `https://druza.com.br/redefinir-senha.html`
  - (e as versões `http://localhost:5510/...` enquanto testa local)
- **Email Templates** (opcional agora): personalize os e-mails de confirmação e
  de recuperação com a marca Druza.

> O Supabase já envia os e-mails de confirmação e recuperação. Em produção, com
> volume, configure um SMTP próprio (ex.: Resend) em **Project Settings → Auth → SMTP**.

## 4. Conectar o site às chaves

1. No painel → **Project Settings → API**, copie:
   - **Project URL**
   - **anon public** key (pode ficar no navegador — o RLS protege os dados).
2. Copie o arquivo de exemplo e preencha:
   ```
   js/config.example.js   →   js/config.js
   ```
   ```js
   window.DRUZA_CONFIG = {
     SUPABASE_URL: 'https://xxxx.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...'   // anon public
   };
   ```
3. `js/config.js` já está no `.gitignore` — **nunca** versione esse arquivo.
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
| `js/config.example.js` | Modelo de config (copie p/ `js/config.js`) |
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

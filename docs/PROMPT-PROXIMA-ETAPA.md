# Prompt pronto — Próxima etapa (logística, pacote 1)

Copie o texto abaixo (a partir de "## Tarefa") e cole numa nova sessão do
Claude Code, com o diretório de trabalho em `C:\Users\KABUM\Desktop\Druza_site`.

---

## Tarefa

Implemente as 4 melhorias de logística abaixo no painel administrativo da
Druza Semi Joias, na ordem listada. São os itens **1, 5, 6 e 8** de
`docs/IDEIAS-ADMIN-LOGISTICA.md` — leia esse arquivo primeiro para o contexto
completo de cada ideia antes de começar.

### Contexto do projeto (leia antes de codar)

- Stack: HTML/CSS/JS puro (sem framework, sem build) + Supabase (Postgres +
  Auth + Edge Functions em Deno) + MercadoPago.
- Painel admin: `admin.html` (abas Pedidos/Produtos) + `js/admin.js`
  (`window.DruzaAdmin`) + `css/admin.css`. Login dedicado com 2FA obrigatório
  em `admin-login.html`.
- **Padrão de segurança obrigatório**: toda ação administrativa nova passa por
  uma Edge Function em `supabase/functions/admin-*` que chama
  `requireAdmin(req)` de `_shared/require-admin.ts` (valida JWT + tabela
  `admins` + 2FA/`aal2`) antes de tocar o banco com `service_role`. Nunca
  libere uma tabela nova via RLS direto pro client. Leia
  `supabase/functions/admin-list-orders/index.ts` e
  `supabase/functions/admin-update-order/index.ts` como referência de padrão
  (CORS de `_shared/cors.ts`, rate limit de `_shared/rate-limit.ts`, log via
  `logAdminAction`).
- Tabelas relevantes hoje: `orders` (id, user_id, status, tracking_code,
  total_cents, subtotal_cents, shipping_cents, discount_cents, mp_payment_id,
  created_at, updated_at), `order_items`, `admin_audit_log`.
- Leia `docs/SEGURANCA.md` antes de mexer em Edge Functions — princípio geral:
  nunca confiar em dado vindo do navegador para decisão sensível.
- Depois de qualquer mudança de schema, edite `db/schema-admin.sql` (mantendo
  idempotência: `alter table ... add column if not exists`, etc.) — **não**
  crie um arquivo de migration novo, este projeto usa um único schema
  cumulativo por área.

### 1) Link de rastreio clicável + copiar

No detalhe do pedido do admin (`openOrderDetail` em `admin.html`, dentro do
modal `#order-modal`) e na área da conta do cliente (`conta.html`, na seção de
pedidos), quando o pedido tiver `tracking_code`:

- Detecte se o formato bate com Correios (`^[A-Z]{2}\d{9}BR$`, case-insensitive
  antes de testar). Se bater, mostre um link para
  `https://rastreamento.correios.com.br/app/index.php?objetos=<codigo>`.
  Se não bater o formato, mostre o código como texto simples (não force um
  link errado para uma transportadora que não é a real).
- Adicione um botão "Copiar" ao lado do código (usa `navigator.clipboard`,
  com fallback silencioso se falhar — não trave a UI).
- Sem tabela nova, sem Edge Function nova — é só front-end lendo o campo que
  já existe (`order.tracking_code` já vem de `admin-get-order` e de
  `A.listOrders()` em `conta.html`).

### 2) Alerta de pedido parado

- Em `db/schema-admin.sql`, adicione (idempotente):
  `alter table public.orders add column if not exists paid_at timestamptz;`
  Popule `paid_at` sempre que o status virar `'paid'` — o lugar certo é dentro
  de `supabase/functions/webhook-mp/index.ts`, no update que marca `newStatus
  === 'paid'` (setar `paid_at = now()` só se ainda não tiver, para não
  sobrescrever em notificações repetidas do MP).
- Em `admin-list-orders/index.ts`, já devolve os pedidos — no `admin.html`,
  ao renderizar uma linha com `status === 'paid'` e `paid_at` há mais de 48h
  (`Date.now() - new Date(paid_at) > 48*3600*1000`), adicione uma classe/badge
  visual "Atrasado" (vermelho/âmbar, reaproveite o padrão de `.badge-status`
  em `css/admin.css`, criando um novo `data-status="atrasado"` com uma cor
  de alerta que ainda não existe na paleta de badges).

### 3) Filtro por período + exportar CSV

- Na aba Pedidos de `admin.html`, adicione dois campos de data
  ("De" / "Até") na `.admin-filter-bar`, ao lado do filtro de status já
  existente.
- Em `admin-list-orders/index.ts`, aceite `date_from`/`date_to` opcionais no
  body e aplique `.gte('created_at', ...)`/`.lte('created_at', ...)` na query
  (valide que são datas ISO válidas antes de usar).
- Adicione um botão "Exportar CSV" que gera o CSV **no navegador** a partir
  dos pedidos já carregados na tela (sem chamada nova ao servidor): colunas
  id, data, cliente, status, itens (concatenados), subtotal, frete, desconto,
  total, rastreio. Baixe via `Blob` + `URL.createObjectURL` +
  `<a download>`. Escape de vírgulas/aspas no CSV é obrigatório (campos como
  nome do cliente e itens podem conter vírgula).

### 4) Notas internas do pedido

- `db/schema-admin.sql`: `alter table public.orders add column if not exists
  admin_notes text;` (idempotente).
- `admin-update-order/index.ts`: aceitar `admin_notes` opcional no body,
  com `.slice(0, 2000)` como cap de tamanho (mesmo padrão de sanitização já
  usado para `tracking_code` nessa function).
- No modal de detalhe do pedido (`admin.html`), adicione um `<textarea>` para
  editar a nota, com botão "Salvar nota" que chama `D.updateOrder({ order_id,
  admin_notes })`. **Nunca** exiba esse campo em `conta.html` (é só para uso
  interno do admin) — não crie nenhum caminho de leitura desse campo fora das
  Edge Functions admin.

### Verificação (obrigatória antes de terminar)

Use os MCP tools de preview (`preview_start`, `preview_eval`,
`preview_console_logs`, `preview_network`) apontando para uma porta separada
(o site já roda em produção/local na 5510 — não reaproveite essa porta, crie
uma config nova tipo `druza-verify` na 5511+ em `.claude/launch.json` do
projeto, e remova-a no final).

- Confirme zero erros de console nas páginas tocadas.
- Como o fluxo completo exige login de admin com 2FA (que você não tem
  credencial para simular), teste a lógica pura via `preview_eval` isolado
  (recriando DOM/objetos de exemplo em memória, sem precisar de sessão real)
  para: regex do rastreio, geração do CSV (confira que uma vírgula num nome
  de cliente fica escapada corretamente), e o cálculo de "48h atrás".
- Depois de rodar `db/schema-admin.sql` (ação do dono do projeto, não sua),
  as Edge Functions tocadas precisam de
  `supabase functions deploy admin-list-orders` /
  `admin-update-order` / `webhook-mp --no-verify-jwt` — **não rode isso você
  mesmo**; ao final, liste os comandos exatos que o dono precisa rodar,
  igual já é feito no restante da documentação do projeto.

### Ao terminar

Atualize `docs/IDEIAS-ADMIN-LOGISTICA.md` marcando os itens 1, 5, 6 e 8 como
✅ feitos (com a data), e adicione uma entrada curta no `README.md` na seção
de estado/pendências se fizer sentido.

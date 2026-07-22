# Bloqueio P0 de ACLs do Supabase

Data: 2026-07-22

## Objetivo

Eliminar a execução direta, por clientes anônimos ou autenticados, de funções
privilegiadas no PostgreSQL do projeto Supabase. A correção deve preservar os
fluxos atuais das Edge Functions, impedir que novos objetos voltem a nascer com
privilégios amplos e ser aplicada sem consultar dados pessoais ou invocar RPCs.

O proprietário autorizou a aplicação direta em produção depois da revisão desta
especificação e do plano de implementação.

## Contexto confirmado

Os metadados do banco e o Security Advisor identificaram dez funções
`SECURITY DEFINER` no schema `public` executáveis por `anon` e `authenticated`
por meio do privilégio herdado de `PUBLIC`:

- `admin_customer_summary(integer, integer)`;
- `admin_dashboard_metrics()`;
- `admin_find_order_ids(text)`;
- `admin_find_user_ids(text)`;
- `admin_move_inventory(uuid, uuid, text, integer, text, text, integer, text, text)`;
- `admin_save_product(uuid, uuid, jsonb, jsonb, integer)`;
- `enforce_single_primary_image()`;
- `log_order_status_change()`;
- `product_stock_snapshot()`;
- `sync_product_legacy_columns()`.

O default ACL de funções criadas por `postgres` no schema `public` já está
parcialmente fechado. O default ACL de `supabase_admin` ainda concede execução
automática a `anon`, `authenticated` e `service_role`. Os defaults de tabelas e
sequências também não seguem integralmente um modelo opt-in para os dois owners.

O mapeamento estático encontrou todas as chamadas RPC do repositório dentro de
Edge Functions que usam a chave secreta ou `service_role`. Não existe chamada
RPC no frontend. A função `effective_price_cents` possui um grant público
histórico e será preservada nesta correção para evitar mudança de contrato fora
do escopo emergencial.

## Alternativas consideradas

### 1. Bloqueio atômico com allowlist — escolhida

Revogar a execução de funções em `public` e `private` para `PUBLIC`, `anon` e
`authenticated`; regrantar explicitamente as funções necessárias; e corrigir os
default ACLs de `postgres` e `supabase_admin`.

Esta opção fecha a exposição atual e o mecanismo que pode recriá-la, mantendo
uma lista explícita de consumidores legítimos.

### 2. Corrigir apenas as dez funções sinalizadas

Teria menor superfície de mudança imediata, mas continuaria dependente de cada
novo script lembrar de revogar o grant padrão. Também deixaria funções internas
fora da verificação uniforme.

### 3. Mover todas as RPCs privilegiadas para um schema interno

É uma arquitetura desejável no longo prazo, mas exige alteração coordenada das
Edge Functions, configuração do Data API e migrações. Não é adequada ao P0.

## Arquitetura aprovada

A implementação terá um script forward transacional e idempotente em `db/`,
seguindo o padrão já adotado pelo projeto. O mesmo SQL revisado será aplicado no
projeto Supabase de produção.

A aplicação remota ocorrerá uma única vez como migração nomeada pelo conector
autorizado do Supabase. Não haverá tentativa iterativa de DDL em produção: uma
falha interromperá a operação e exigirá correção e nova revisão do SQL local.

O script fará, nesta ordem:

1. iniciar uma transação;
2. revogar `EXECUTE` em todas as funções de `public` e `private` de `PUBLIC`,
   `anon` e `authenticated`;
3. corrigir default ACLs para objetos futuros criados por `postgres` e
   `supabase_admin`;
4. regrantar as RPCs necessárias a `service_role`;
5. preservar o grant atual de `effective_price_cents` para `anon`,
   `authenticated` e `service_role`;
6. solicitar recarga do schema do PostgREST;
7. confirmar a transação.

Os default ACLs de `public` serão opt-in para funções, tabelas e sequências. Os
defaults de funções no schema `private` também serão fechados. A mudança dos
defaults não revogará privilégios de tabelas ou sequências já existentes; ela
controlará somente objetos criados posteriormente.

## Allowlist de `service_role`

As seguintes funções continuarão executáveis por `service_role`:

- `consume_rate_limit(text, text, integer, integer)`;
- `create_reserved_order(uuid, uuid, jsonb, text)`;
- `claim_payment_attempt(uuid, uuid, text)`;
- `cancel_payment_attempt(uuid, uuid, text)`;
- `apply_payment_event(text, text, uuid, text, text, integer, text, timestamptz, timestamptz)`;
- `list_payment_reconciliation_candidates(integer)`;
- `reconcile_payment_not_found(uuid, uuid)`;
- `release_expired_pending_reservations(integer)`;
- `admin_move_inventory(uuid, uuid, text, integer, text, text, integer, text, text)`;
- `admin_save_product(uuid, uuid, jsonb, jsonb, integer)`;
- `product_stock_snapshot()`;
- `admin_dashboard_metrics()`;
- `admin_customer_summary(integer, integer)`;
- `admin_find_user_ids(text)`;
- `admin_find_order_ids(text)`.

`effective_price_cents(integer, integer, timestamptz, timestamptz)` permanecerá
executável por `anon`, `authenticated` e `service_role`. Ela não é
`SECURITY DEFINER` e sua remoção do contrato público não é necessária para
resolver o P0.

Funções de trigger e funções do schema `private` não receberão grant direto para
clientes. O disparo de triggers e as chamadas internas por funções privilegiadas
não dependem de um grant de execução ao usuário final.

## Alterações no repositório

Depois da validação em produção, a correção será incorporada aos scripts-base:

- tornar `db/schema-catalog-inventory.sql` autossuficiente, revogando execução
  antes dos grants seletivos;
- explicitar `FOR ROLE postgres` e `FOR ROLE supabase_admin` nos default ACLs
  relevantes de `db/security-final-hardening.sql`;
- fechar defaults de funções no schema `private`;
- ampliar `db/schema-catalog-inventory-smoke-test.sql` e
  `db/security-final-hardening-smoke-test.sql` com verificações de privilégios.

As alterações não incluirão arquivos temporários, artefatos gerados ou outras
modificações já presentes no worktree.

## Fluxo operacional

1. Capturar um inventário somente de metadados: owner, assinatura, tipo de
   segurança e ACL efetivo das funções, além dos default ACLs.
2. Preparar e revisar o SQL forward localmente.
3. Aplicar o SQL em produção numa única migração nomeada e transacional.
4. Reconsultar apenas os metadados de permissões.
5. Executar o Security Advisor.
6. Atualizar scripts-base e smoke tests no repositório.
7. Executar validações estáticas locais e revisar o diff final.

Não serão feitas chamadas a RPCs, endpoints de negócio ou tabelas com dados de
clientes durante a verificação do P0.

## Erros e recuperação

Uma falha antes do `commit` reverterá toda a transação. A implementação não
tentará repetir automaticamente uma operação que falhe por assinatura ou
permissão; primeiro corrigirá o SQL com base no erro retornado.

Se uma regressão for detectada depois do commit, a recuperação será um grant
específico da assinatura afetada para `service_role`. A recuperação nunca
restaurará `EXECUTE` para `PUBLIC`, `anon` ou `authenticated` em uma função
privilegiada.

O inventário anterior permitirá comparar o estado sem armazenar registros de
negócio ou dados pessoais.

## Verificação e critérios de aceite

A correção estará concluída somente quando todos os critérios abaixo forem
verdadeiros:

1. nenhuma função `SECURITY DEFINER` de `public` é executável por `anon` ou
   `authenticated`;
2. as quinze RPCs da allowlist são executáveis por `service_role`;
3. `effective_price_cents` mantém os grants de compatibilidade aprovados;
4. funções de trigger e funções de `private` não são diretamente executáveis
   por clientes;
5. default ACLs de `postgres` e `supabase_admin` não concedem automaticamente
   funções, tabelas ou sequências a `PUBLIC`, `anon`, `authenticated` ou
   `service_role`;
6. os alertas `0028_anon_security_definer_function_executable` e
   `0029_authenticated_security_definer_function_executable` não aparecem no
   Security Advisor;
7. os smoke tests de ACL e as validações estáticas locais passam;
8. nenhuma verificação acessa dados pessoais ou executa uma operação de negócio.

Alertas do advisor que não pertencem a este P0 permanecerão registrados para as
prioridades seguintes.

## Fora do escopo do P0

- autenticar o endpoint `reconcile-stale-payments`;
- alterar políticas do Storage;
- configurar proteção de senhas vazadas ou CAPTCHA;
- modificar CORS, CSP ou headers do host;
- limpar o histórico Git ou artefatos versionados;
- revisar a política de privacidade e retenção;
- mover funções para outro schema.

Esses itens serão tratados em etapas próprias depois da conclusão verificada do
P0.

# Plano de implementação — bloqueio P0 de ACLs do Supabase

Baseado em [2026-07-22-supabase-p0-acl-lockdown-design.md](./2026-07-22-supabase-p0-acl-lockdown-design.md).

## 1. Preflight somente de metadados

- Confirmar assinaturas, owners e privilégios efetivos das funções de `public` e
  `private` usando `pg_proc`, `pg_namespace` e `has_function_privilege`.
- Confirmar os default ACLs de `postgres` e `supabase_admin` em `pg_default_acl`.
- Registrar a lista atual de alertas do Security Advisor sem consultar tabelas de
  negócio.

## 2. SQL forward do P0

- Criar `db/security-p0-acl-lockdown.sql` como script transacional e idempotente.
- Revogar execução de funções de `public` e `private` para `PUBLIC`, `anon` e
  `authenticated`.
- Fechar default ACLs de funções, tabelas e sequências de `public` para
  `postgres` e `supabase_admin`, incluindo `service_role` nos defaults.
- Fechar default ACLs de funções de `private` para os dois owners.
- Regrantar as quinze RPCs aprovadas para `service_role`.
- Preservar `effective_price_cents` para `anon`, `authenticated` e
  `service_role`.
- Notificar o PostgREST para recarregar o schema.

## 3. Revisão pré-produção

- Validar whitespace e sintaxe estática disponível localmente.
- Conferir cada assinatura contra o catálogo vivo e contra os call sites das
  Edge Functions.
- Submeter o SQL a uma revisão defensiva independente.

## 4. Aplicação em produção

- Aplicar o conteúdo aprovado como migração nomeada
  `security_p0_acl_lockdown` no projeto autorizado.
- Não fazer tentativas parciais nem executar RPCs de negócio.
- Em erro, interromper e revisar; a transação deve impedir estado parcial.

## 5. Verificação pós-migração

- Confirmar zero funções `SECURITY DEFINER` de `public` executáveis por `anon`
  ou `authenticated`.
- Confirmar `service_role` nas quinze RPCs da allowlist.
- Confirmar os grants de compatibilidade de `effective_price_cents`.
- Confirmar funções de trigger e de `private` fechadas para clientes.
- Confirmar defaults opt-in para `postgres` e `supabase_admin`.
- Rodar o Security Advisor e exigir a ausência dos alertas `0028` e `0029`.

## 6. Alinhamento dos scripts-base

- Atualizar `db/security-final-hardening.sql` com default ACLs explícitos para os
  dois owners e para funções de `private`.
- Atualizar `db/schema-catalog-inventory.sql` com revokes autossuficientes antes
  dos grants seletivos.
- Atualizar `db/security-final-hardening-smoke-test.sql` e
  `db/schema-catalog-inventory-smoke-test.sql` com invariantes de ACL.

## 7. Validação e entrega

- Executar buscas estáticas por grants amplos e assinaturas divergentes.
- Executar `git diff --check` nos arquivos alterados.
- Solicitar revisão final independente do diff e dos resultados do Supabase.
- Criar um commit isolado da implementação P0, sem incorporar as mudanças
  preexistentes em `tmp/`, `output/` ou `.playwright-cli/`.

## Ordem

1 → 2 → 3 → 4 → 5 → 6 → 7.

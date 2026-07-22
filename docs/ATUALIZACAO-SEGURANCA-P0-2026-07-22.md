# Atualização de segurança P0 — 2026-07-22

## Estado

A migração Supabase `security_p0_acl_lockdown` foi aplicada ao projeto
autorizado em 2026-07-22, versão remota `20260722205239`.

O hotfix removeu o `EXECUTE` herdado de `PUBLIC`, `anon` e `authenticated` das
funções privilegiadas de `public` e das funções internas de `private`. As quinze
RPCs consumidas pelas Edge Functions continuam explicitamente disponíveis para
`service_role`. `effective_price_cents` preserva o contrato público aprovado.

## Verificações concluídas

- zero funções `SECURITY DEFINER` de `public` executáveis por `anon` ou
  `authenticated`;
- quinze RPCs da allowlist existentes e executáveis por `service_role`;
- defaults globais de funções do owner `postgres` fechados;
- defaults de tabelas, sequências e funções de `public` do owner `postgres`
  fechados;
- objetos de prova futuros nasceram sem grants para `anon`, `authenticated` ou
  `service_role`; a transação de prova terminou em `ROLLBACK`;
- Security Advisor sem os alertas `0028` e `0029`;
- smoke test `db/security-p0-acl-lockdown-smoke-test.sql` aprovado;
- nenhuma RPC de negócio foi invocada e nenhuma tabela com dados pessoais foi
  consultada.

## Risco residual controlado

O banco conserva default ACLs legados de `supabase_admin`. A conexão autorizada
executa como `postgres` e não pode assumir esse role, portanto não pode alterar
os defaults dele sem outro contexto autorizado.

O inventário confirmou que todas as 35 funções e os 13 objetos relacionais de
`public/private` pertencem a `postgres`; nenhum objeto atual pertence a
`supabase_admin`. Assim, esse resíduo não reabre a exposição corrigida, mas deve
ser removido antes de qualquer fluxo voltar a criar objetos como
`supabase_admin`.

Para concluir esse item residual, usar uma sessão autenticada do Dashboard/Data
API capaz de atualizar os defaults do owner legado ou executar o SQL como membro
de `supabase_admin`. Não se deve tentar elevar o papel `postgres` nem contornar
essa separação de privilégios.

## Próxima prioridade

Tratar os itens P1: autenticação do reconciliador, política de listagem do
Storage, proteção de credenciais/senhas, CORS e limpeza dos artefatos públicos do
repositório.

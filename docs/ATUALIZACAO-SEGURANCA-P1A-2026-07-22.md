# Atualizacao de seguranca P1A - reconciliador HMAC

## Escopo

Este P1A autentica `reconcile-stale-payments` antes de qualquer acesso
administrativo. O cron e o unico consumidor intencional autorizado e comprova
posse de um secret dedicado por HMAC-SHA256 com timestamp, metodo, caminho e
hash do corpo canonico `{}`.

Nao fazem parte deste P1A mudancas nas regras de pagamento, estoque ou dados de
clientes.

## Controles implementados localmente

- secret de 32 bytes representado por 64 caracteres hex lowercase;
- `CURRENT` obrigatorio e `PREVIOUS` opcional para rotacao;
- janela antirreplay de 120 segundos;
- corpo JSON vazio limitado a 1 KiB e lido de forma incremental;
- comparacao constante de digests HMAC de 32 bytes;
- leitura de configuracao administrativa somente depois da autenticacao;
- cron assinado com secret lido em tempo de execucao no Supabase Vault;
- caminho publico mantido como valor canonico da assinatura, com apenas os
  aliases exatos do runtime aceitos (`/functions/v1/reconcile-stale-payments`,
  `/reconcile-stale-payments` e `/`);
- respostas autenticadas marcadas apenas com
  `x-druza-reconciler-auth: v1`;
- smoke SQL sem chamada HTTP, RPC ou retorno de secret/comando.

`verify_jwt = false` permanece intencional para esta funcao porque a
autenticacao customizada ocorre dentro do handler antes do boundary
privilegiado.

## Verificacao local e revisao

- vetor HMAC sintetico identico em TypeScript e PostgreSQL;
- suite local com 15/15 testes cobrindo o helper e a ordem estatica do handler;
- testes de secret, rotacao, timestamp, assinatura, caminho, content type,
  limite/encoding do corpo e vazamento de erros;
- teste estatico de ordem bloqueia import antecipado de chaves administrativas;
- `node --check` aprovado no helper e no handler;
- revisoes independentes de backend e seguranca deram GO para o ajuste final;
- nenhuma chamada manual ao endpoint e nenhuma RPC de negocio executada.

## Rollout remoto

- base local revisada: commit `691474b`;
- correcoes operacionais finais: commit `43095d4`;
- Edge secret `RECONCILE_CRON_HMAC_SECRET_CURRENT` e Vault
  `druza_reconcile_cron_hmac` sincronizados por comparacao interna de digest,
  sem retorno do valor;
- migration `secure_reconcile_stale_payments_hmac`, versao
  `20260722225637`, aplicada;
- job unico `jobid = 1`, ativo, agenda `*/5 * * * *`, database/username
  `postgres`, sem credencial literal no comando;
- Edge Function final `reconcile-stale-payments` versao 9, `ACTIVE`, com
  `verify_jwt = false` explicitamente aprovado e gate HMAC no handler;
- primeira execucao natural validada em `2026-07-22 23:10:00 UTC`: cron
  `succeeded`, HTTP `200`, marcador autenticado `v1`;
- segunda execucao natural validada em `2026-07-22 23:15:00 UTC`: cron
  `succeeded`, HTTP `200`, marcador autenticado `v1`;
- smoke remoto transacional concluido sem erro e com `rollback`;
- nenhuma execucao manual do job ou do endpoint durante o rollout.

Dois ajustes falharam de forma segura antes do resultado final: a primeira
tentativa da migration foi revertida porque o papel gerenciado nao pode alterar
`username` em `cron.alter_job`; a versao 8 retornou `401` antes do boundary
privilegiado devido a normalizacao do pathname pelo runtime. O SQL passou a
validar o contexto e alterar somente campos permitidos, e a versao 9 passou a
aceitar apenas os aliases exatos mantendo o caminho publico na assinatura.

## Advisors e proximas prioridades

Nenhum advisor esta ligado aos objetos criados ou alterados pelo P1A. Restam,
fora deste escopo:

1. **P1:** remover a policy ampla de listagem do bucket publico
   `product-images` se a enumeracao de objetos nao for requisito;
2. **P1:** habilitar protecao contra senhas vazadas no Supabase Auth;
3. **P2:** confirmar e documentar como deny-all intencional as cinco tabelas
   com RLS e sem policy, ou criar policies minimas quando houver consumidor;
4. **P2:** avaliar indices para as FKs `admin_user_id` de
   `inventory_movements` e `order_status_history`;
5. **P3:** observar uso antes de remover qualquer indice marcado como nao
   utilizado.

## Rollback fail-closed

Em falha apos o deploy, desativar o job pelo `jobid` usando
`cron.alter_job(..., active := false)`, manter o handler autenticado publicado,
corrigir configuracao/encoding e somente entao reativar o cron. A versao sem
autenticacao nunca deve ser republicada.

## Riscos residuais

- o Edge secret customizado pertence ao ambiente de Edge Functions do projeto,
  nao a uma unica funcao; ele concede somente a capacidade HMAC dedicada;
- a seguranca operacional depende de manter Edge secret e Vault sincronizados;
- `verify_jwt = false` exige preservar o gate HMAC no inicio do handler.

## Privacidade e limites observados

- zero leitura de pedidos, pagamentos, perfis ou usuarios durante a revisao;
- zero valor de secret impresso, retornado, registrado ou versionado;
- zero invocacao manual do reconciliador;
- zero RPC de pagamento, estoque ou administracao chamada manualmente.

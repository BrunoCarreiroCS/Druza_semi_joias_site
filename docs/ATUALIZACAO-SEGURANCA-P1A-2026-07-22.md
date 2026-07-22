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
- respostas autenticadas marcadas apenas com
  `x-druza-reconciler-auth: v1`;
- smoke SQL sem chamada HTTP, RPC ou retorno de secret/comando.

`verify_jwt = false` permanece intencional para esta funcao porque a
autenticacao customizada ocorre dentro do handler antes do boundary
privilegiado.

## Verificacao local

- vetor HMAC sintetico identico em TypeScript e PostgreSQL;
- suite local atual cobre o helper e a ordem estatica do handler;
- testes de secret, rotacao, timestamp, assinatura, caminho, content type,
  limite/encoding do corpo e vazamento de erros;
- teste estatico de ordem bloqueia import antecipado de chaves administrativas;
- nenhuma chamada manual ao endpoint e nenhuma RPC de negocio executada.

## Rollout remoto

O rollout permanece condicionado, nesta ordem, a:

1. provisionar o mesmo valor no Edge secret
   `RECONCILE_CRON_HMAC_SECRET_CURRENT` e no Vault
   `druza_reconcile_cron_hmac`, sem expor o valor;
2. aplicar a migracao `secure_reconcile_stale_payments_hmac`;
3. publicar imediatamente o handler autenticado;
4. observar duas execucoes naturais consecutivas;
5. executar smoke de metadados e Security Advisor.

Versao remota, hash publicado, migration e horarios/status serao registrados
somente depois da verificacao natural.

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

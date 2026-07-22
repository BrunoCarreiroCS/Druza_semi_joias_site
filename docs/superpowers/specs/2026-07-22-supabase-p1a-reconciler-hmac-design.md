# Supabase P1A: autenticacao HMAC do reconciliador

**Data:** 2026-07-22

**Projeto remoto autorizado:** `hqkpgghlbwincahfwkem`

**Status:** desenho aprovado; implementacao ainda nao iniciada

## Objetivo

Tornar o cron o unico consumidor intencional e autorizado de
`reconcile-stale-payments`. A funcao continuara sendo chamada a cada cinco
minutos por `pg_cron` + `pg_net`, mas toda chamada devera provar posse de um
segredo exclusivo do reconciliador antes de criar o cliente administrativo,
consumir o lock duravel ou invocar qualquer RPC. HMAC comprova posse do segredo,
nao a origem de rede da requisicao.

O resultado esperado e eliminar a possibilidade atual de um terceiro disparar
ou antecipar a reconciliacao pela URL publica da Edge Function.

## Contexto e ameaca

O estado atual combina:

- `verify_jwt = false` em `supabase/config.toml`;
- um handler que aceita qualquer `POST` sem autenticar o chamador;
- um cron que envia apenas `Content-Type: application/json` e corpo `{}`;
- um cliente administrativo que ignora RLS;
- um lock duravel de 240 segundos.

O lock limita frequencia, mas nao identidade. Um terceiro pode consumir a
janela imediatamente antes do cron e atrasar a rotina legitima. Como o handler
opera com credenciais administrativas e RPCs de pagamento, a autenticacao deve
ocorrer antes de qualquer efeito privilegiado.

## Decisao

Usar HMAC-SHA256 com timestamp e um segredo aleatorio dedicado somente a este
endpoint.

O segredo sera guardado em dois locais controlados:

- Supabase Vault, para o comando executado por `pg_cron`;
- secrets da Edge Function, para a verificacao no handler.

O valor bruto nao sera enviado pela requisicao. O cron enviara apenas uma
assinatura derivada e o timestamp usado para calcula-la.

`verify_jwt` permanecera desativado de forma intencional. A funcao nao recebe
sessao de usuario, e a autenticacao customizada sera aplicada no inicio do
handler. A documentacao atual do Supabase orienta que chaves modernas de
servico sejam enviadas em `apikey`, nao como JWT em `Authorization`; neste
projeto, uma API key nao foi escolhida porque teria privilegios muito mais
amplos do que a capacidade restrita de invocar este unico endpoint.

## Alternativas consideradas

### 1. HMAC com segredo exclusivo - escolhida

Vantagens:

- menor privilegio: o segredo concede somente a capacidade de invocacao;
- o segredo bruto nao entra na fila HTTP do `pg_net`;
- rotacao independente das chaves administrativas do projeto;
- compativel com o cron atual e com `verify_jwt = false`.

Desvantagens:

- exige implementacao criptografica pequena nos dois lados;
- permite replay durante a curta janela temporal se uma assinatura for
  capturada.

### 2. Segredo estatico em header proprio

Seria mais simples, mas colocaria o segredo reutilizavel na requisicao e,
temporariamente, nas estruturas internas de `pg_net`. Foi rejeitado para reduzir
o impacto de observabilidade indevida de headers.

### 3. Secret API key nomeada do Supabase

E o padrao oficial para muitas chamadas servico-a-servico, mas uma
`sb_secret_...` ignora RLS e tem alcance sobre o projeto. Se vazasse no caminho
do cron, o impacto seria muito maior que a invocacao deste endpoint. Tambem nao
deve ser enviada como JWT em `Authorization`.

## Escopo

### Incluido

- helper de autenticacao HMAC isolado em `_shared`;
- validacao no inicio de `reconcile-stale-payments`;
- assinatura do cron com segredo lido do Vault;
- suporte temporario a segredo anterior para rotacao;
- testes locais sem RPCs ou dados reais;
- smoke tests de metadados do cron e do Vault;
- documentacao de configuracao, deploy, rotacao e recuperacao;
- verificacao remota apenas por metadados e execucoes naturais do cron.

### Fora de escopo

- execucao manual por administrador;
- nova rota operacional;
- tabela de nonces ou replay cache;
- mudancas nas RPCs, regras de pagamento, estoque ou dados existentes;
- uso de `service_role`, `sb_secret_...`, chave anon ou publishable como
  credencial HTTP do cron;
- invocacao manual do reconciliador para validar a entrega.

## Protocolo de autenticacao

### Credenciais

- Nome logico no Vault: `druza_reconcile_cron_hmac`.
- Secret atual na Edge Function: `RECONCILE_CRON_HMAC_SECRET_CURRENT`.
- Secret anterior opcional: `RECONCILE_CRON_HMAC_SECRET_PREVIOUS`.
- Formato obrigatorio: exatamente 64 caracteres hexadecimais minusculos que
  representam 32 bytes gerados por fonte criptograficamente segura.

O valor nunca deve aparecer no repositorio, em SQL versionado, em logs, em
mensagens de erro ou no texto persistido de `cron.job`.

### Headers

- `x-druza-timestamp`: timestamp Unix inteiro em segundos.
- `x-druza-signature`: `v1=<64 caracteres hexadecimais minusculos>`.
- `Content-Type`: `application/json`.

### Mensagem canonica

A mensagem assinada sera formada por linhas separadas por `\n`:

```text
v1
<timestamp>
POST
/functions/v1/reconcile-stale-payments
<sha256 do JSON canonico {}>
```

O caminho e o corpo canonico sao constantes dos dois lados. Depois de validar a
estrutura minima dos headers, o handler lera no maximo 1 KiB, aceitara somente
um objeto JSON vazio, independentemente de espacos na serializacao, e rejeitara
arrays, `null`, valores escalares ou objetos com propriedades. Somente entao
calculara o hash do JSON canonico `{}` e verificara o HMAC. Assim, o corpo aceito
e o corpo representado na assinatura permanecem vinculados.

### Janela temporal

A diferenca absoluta entre o relogio da Edge Function e o timestamp recebido
nao podera exceder 120 segundos. Valores ausentes, nao inteiros, excessivamente
longos, expirados ou futuros falharao.

Essa janela e inferior ao intervalo de cinco minutos do cron. Um replay dentro
dela permanece possivel, mas seu alcance e reduzido por TLS, pelo segredo
dedicado e pelo lock duravel de 240 segundos. Uma tabela de nonces nao sera
adicionada neste P1A.

## Componentes

### Helper compartilhado

Um modulo focado em `_shared` devera:

- carregar segredo atual e anterior sem expo-los;
- validar tamanho e formato dos headers;
- construir a mensagem canonica;
- decodificar cada secret hexadecimal em exatamente 32 bytes;
- calcular HMAC-SHA256 com Web Crypto;
- comparar digests de tamanho fixo em tempo constante;
- aceitar o segredo anterior somente durante rotacao;
- retornar um resultado simples, sem acesso ao banco ou a rede.

O modulo nao criara clientes Supabase, nao registrara headers e nao conhecera
RPCs de pagamento.

### Handler do reconciliador

A ordem obrigatoria sera:

1. aceitar somente `POST`;
2. confirmar que a configuracao HMAC existe;
3. validar a estrutura dos headers e a janela do timestamp;
4. ler no maximo 1 KiB e validar corpo semanticamente igual a `{}`;
5. calcular o hash canonico e validar a assinatura;
6. confirmar `MP_ACCESS_TOKEN` e configuracao administrativa;
7. criar o cliente administrativo;
8. consumir o lock duravel;
9. executar a logica atual de reconciliacao sem alterar suas regras.

Uma chamada nao autenticada nunca podera consumir o lock nem alcancar uma RPC.

### Agendamento SQL

`db/schedule-payment-reconciliation.sql` devera:

- garantir `pg_cron`, `pg_net`, `pgcrypto` no schema `extensions` e a
  disponibilidade do Supabase Vault no schema `vault`;
- falhar se o secret nomeado estiver ausente ou ambiguo;
- ler `decrypted_secret` somente dentro do comando agendado;
- validar o secret com `^[0-9a-f]{64}$` e decodifica-lo por
  `decode(decrypted_secret, 'hex')`;
- gerar o timestamp com o relogio do banco;
- calcular a assinatura explicitamente por
  `extensions.hmac(..., decode(decrypted_secret, 'hex'), 'sha256')`;
- persistir em `cron.job` somente o nome logico do secret e a formula de
  assinatura;
- manter o corpo `{}`, o timeout de 15 segundos e o intervalo atual.

Nenhuma funcao `SECURITY DEFINER` publica sera criada para apoiar o cron.

## Respostas e logs

- Metodo diferente: `405 Method Not Allowed`.
- Configuracao HMAC ausente: `503 Unavailable`.
- Credencial ausente, malformada, expirada ou invalida: `401 Unauthorized` com
  mensagem generica.
- Corpo invalido depois das validacoes preliminares de headers e timestamp:
  `400 Invalid payload`, ainda sem acesso administrativo.
- Lock ja consumido: manter `202`.
- Execucao concluida: manter `200`.
- Falhas operacionais existentes: preservar a semantica atual, salvo ajuste
  estritamente necessario para nao vazar detalhes.

Logs poderao conter apenas categoria generica e contagens. Nao poderao conter
segredo, assinatura, headers, corpo, IP, URL completa com query string,
identificadores de usuarios, pedidos ou pagamentos.

## Rotacao

Rotacao sem interrupcao:

1. gerar novo segredo fora do repositorio;
2. configurar a Edge Function com o novo valor como `CURRENT` e o antigo como
   `PREVIOUS`;
3. atualizar o secret existente de mesmo nome no Vault, preservando seu ID e
   sem criar uma segunda entrada;
4. aguardar duas execucoes naturais e mais a janela de 120 segundos;
5. remover `PREVIOUS` da Edge Function;
6. confirmar que o valor antigo nao permanece em ferramentas ou arquivos
   temporarios.

O identificador `v1` representa a versao do protocolo, nao a versao da chave.

## Implantacao

A ordem inicial evitara indisponibilidade:

1. implementar e validar localmente;
2. configurar o mesmo segredo no Vault e nos secrets da Edge Function por canal
   autenticado que nao o imprima;
3. atualizar primeiro o cron para enviar a assinatura;
4. validar somente os metadados persistidos do job e publicar imediatamente o
   handler autenticado, sem aguardar outro ciclo publico;
5. observar as execucoes naturais seguintes somente por metadados;
6. executar os advisors de seguranca para regressao do banco;
7. atualizar o registro de seguranca do projeto.

Nao sera feita chamada manual ao endpoint durante deploy ou verificacao.

## Testes

### Testes unitarios locais

Cobrir:

- assinatura valida com segredo atual;
- assinatura valida com segredo anterior;
- header ausente, duplicado, longo, com virgula ou malformado;
- assinatura incorreta;
- timestamp expirado, futuro, decimal ou nao numerico;
- adulteracao de metodo, caminho ou corpo canonico;
- configuracao sem segredo atual;
- corpo `{}` aceito e outros corpos rejeitados;
- cliente administrativo, lock e RPCs nao alcancados antes da autenticacao.

Os testes usarao secrets e relogios sinteticos, sem rede, dados reais ou RPCs.

### Smoke test SQL

O teste de metadados devera comprovar, sem retornar o secret:

- extensoes necessarias disponiveis;
- exatamente um secret ativo com o nome esperado;
- secret correspondente ao formato `^[0-9a-f]{64}$`, retornando apenas um
  booleano e nunca o valor;
- job unico, ativo e com intervalo de cinco minutos;
- comando do job referenciando `vault.decrypted_secrets` e HMAC;
- ausencia de literais com formato de chave administrativa;
- ausencia do valor secreto no texto do job, comprovada por comparacao interna
  que retorna apenas um booleano.

### Verificacao remota

- nao invocar manualmente o reconciliador;
- nao invocar RPCs de negocio;
- nao selecionar corpos de resposta nem dados de pedidos ou pagamentos;
- correlacionar apenas horario e codigo HTTP das execucoes naturais;
- obter duas execucoes autenticadas consecutivas, com pelo menos uma resposta
  `200`;
- confirmar que a Edge Function publicada continua com `verify_jwt = false` e
  contem a verificacao HMAC antes da inicializacao administrativa;
- executar advisors para detectar apenas regressoes de banco e registrar seus
  metadados; a seguranca do handler sera coberta por revisao e testes locais.

## Recuperacao e rollback

Falhas de assinatura ou sincronizacao serao tratadas de forma fechada:

1. desativar temporariamente `druza-reconcile-stale-payments`;
2. manter o handler autenticado publicado;
3. corrigir segredo, relogio ou formula de assinatura;
4. reativar o job;
5. observar duas execucoes naturais.

A versao publica anterior nao sera restaurada, pois isso reabriria a
vulnerabilidade. O custo do rollback e um atraso temporario na reconciliacao,
nao perda ou alteracao direta de dados.

## Criterios de aceite

- somente requisicoes HMAC validas avancam alem do gate de autenticacao;
- nenhuma falha de autenticacao consome o lock ou chama RPC;
- o secret bruto nao aparece no repositorio, cron, logs ou saidas de teste;
- o cron permanece o unico consumidor intencional e autorizado; a verificacao
  tecnica comprova posse do segredo dedicado, nao origem de rede;
- duas execucoes naturais consecutivas passam pelo novo gate;
- ao menos uma dessas execucoes termina com `200`;
- nenhuma chamada manual, ataque, RPC de negocio ou acesso a dado pessoal e
  usado na validacao;
- advisors nao apresentam nova regressao de banco; revisao e testes locais nao
  apresentam regressao no handler ou no cron.

## Arquivos previstos

- `supabase/functions/_shared/reconcile-auth.ts`;
- teste local do helper HMAC;
- `supabase/functions/reconcile-stale-payments/index.ts`;
- `db/schedule-payment-reconciliation.sql`;
- smoke test de metadados do agendamento;
- `supabase/config.toml`, apenas para comentario explicativo se necessario;
- README e documentos operacionais que ainda descrevem a rota como publica.

## Referencias

- Supabase, *Securing Edge Functions*: <https://supabase.com/docs/guides/functions/auth>
- Supabase, *Scheduling Edge Functions*: <https://supabase.com/docs/guides/functions/schedule-functions>
- Supabase, *Vault*: <https://supabase.com/docs/guides/database/vault>
- Supabase, *Upcoming changes to Supabase API Keys*: <https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys>
- PostgreSQL, *pgcrypto*: <https://www.postgresql.org/docs/current/pgcrypto.html>

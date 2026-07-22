# Plano de implementacao - Supabase P1A HMAC do reconciliador

Baseado em
[2026-07-22-supabase-p1a-reconciler-hmac-design.md](./2026-07-22-supabase-p1a-reconciler-hmac-design.md).

## Objetivo

Autenticar `reconcile-stale-payments` com HMAC-SHA256 antes de qualquer acesso
administrativo e tornar o cron o unico consumidor intencional e autorizado.
Implementar, revisar, publicar e verificar a correcao sem chamada manual ao
endpoint, sem RPC de negocio e sem leitura de dados pessoais.

## Ambiente confirmado

- Workspace: `C:\Users\KABUM\Desktop\Druza_site`.
- Projeto Supabase autorizado: `hqkpgghlbwincahfwkem`.
- Node.js: `v24.16.0`.
- Supabase CLI: `2.109.0` via `supabase.cmd`.
- Deno nao esta disponivel no `PATH`.
- `pgcrypto` 1.3 em `extensions`.
- `pg_cron` 1.6.4 em `pg_catalog`.
- `pg_net` 0.20.3 em `extensions`.
- `supabase_vault` 0.3.1 em `vault`.

O CLI tenta escrever telemetria fora do workspace. Quando uma operacao CLI for
necessaria, ela deve usar a aprovacao de sandbox correspondente; isso nao
autoriza comandos adicionais nem mudancas remotas fora deste plano.

## Guardrails obrigatorios

- Nao invocar manualmente `reconcile-stale-payments`.
- Nao invocar RPCs de pagamento, estoque ou administracao.
- Nao selecionar pedidos, pagamentos, perfis, usuarios ou outros dados de
  negocio.
- Nao imprimir, retornar, registrar ou versionar o segredo HMAC.
- Tratar o secret customizado como configuracao de projeto: no Supabase
  hospedado ele fica disponivel ao ambiente das Edge Functions do projeto, nao
  apenas a este handler. Nenhuma outra funcao deve le-lo ou registra-lo.
- Nao usar `service_role`, `sb_secret_...`, anon ou publishable como credencial
  do cron.
- Nao restaurar a versao publica anterior como rollback.
- Nao incluir no commit delecoes preexistentes em `tmp/` nem
  `.playwright-cli/`.
- Interromper diante de qualquer divergencia de projeto, segredo, assinatura ou
  ownership antes da primeira mutacao remota.

## 1. Preflight local e remoto somente de metadados

### Arquivos

Somente leitura:

- `supabase/functions/reconcile-stale-payments/index.ts`;
- `supabase/functions/_shared/rate-limit.ts`;
- `supabase/functions/_shared/payment.ts`;
- `supabase/functions/_shared/supabase-env.ts`;
- `supabase/config.toml`;
- `db/schedule-payment-reconciliation.sql`;
- documentos que descrevem o deploy do reconciliador.

### Acoes

1. Registrar `git status --short` e preservar toda alteracao fora do escopo.
2. Confirmar a versao viva da Edge Function e `verify_jwt = false` com
   `list_edge_functions` e `get_edge_function`.
3. Consultar somente estes metadados do cron:
   - job unico `druza-reconcile-stale-payments`;
   - intervalo, owner, database e estado ativo;
   - booleanos indicando se o comando atual possui HMAC, Vault ou credenciais
     literais, sem retornar o comando completo depois que houver segredo.
4. Consultar `pg_proc` apenas para obter assinaturas reais de
   `vault.create_secret` e `vault.update_secret`; nao adivinhar a API.
5. Confirmar em `pg_proc` a assinatura real de `cron.alter_job` no
   `pg_cron` 1.6.4 e preparar, sem executar, o SQL exato de desativacao por
   `jobid` para rollback.
6. Contar por nome, sem retornar valor, se `druza_reconcile_cron_hmac` ja existe
   no Vault.
7. Listar somente nomes/digests dos Edge secrets, nunca valores.
8. Confirmar novamente os schemas das quatro extensoes necessarias.

### Gate

Prosseguir somente se o projeto, o job e a funcao corresponderem ao inventario
aprovado. Qualquer secret preexistente com nome divergente ou duplicado exige
parada e revisao.

## 2. Criar testes falhando para o helper HMAC

### Arquivo novo

`supabase/functions/_shared/reconcile-auth.test.ts`

### Casos obrigatorios

- segredo atual valido;
- segredo anterior valido durante rotacao;
- segredo ausente, com tamanho errado, maiusculas ou caractere nao hexadecimal;
- `x-druza-timestamp` ausente, duplicado/com virgula, longo, decimal, futuro ou
  expirado;
- `x-druza-signature` ausente, duplicado/com virgula, longo ou diferente de
  `v1=` seguido por exatamente 64 caracteres hexadecimais minusculos;
- assinatura incorreta;
- metodo e caminho adulterados;
- `{}`, `{ }` e JSON vazio semanticamente equivalente aceitos;
- array, `null`, escalar, objeto com propriedade, JSON invalido e corpo maior
  que 1 KiB rejeitados;
- segredo anterior vazio nao reduz a exigencia do segredo atual;
- segredo anterior presente e curto, uppercase, nao hexadecimal ou longo faz a
  configuracao inteira falhar fechada com `503`;
- comparacao de digest executada apenas sobre vetores de 32 bytes;
- nenhum secret, header ou corpo aparece em mensagens de erro.

### Vetor conhecido

Definir no teste um secret sintetico de 64 hex, timestamp fixo, caminho fixo e
corpo canonico `{}`. Fixar o digest SHA-256 do corpo e o HMAC esperado. O mesmo
vetor sera repetido no smoke test SQL para detectar divergencia de bytes,
encoding, quebras de linha ou prefixo `v1=`.

O teste deve ser puro para Node 24: usar somente `node:test`,
`node:assert/strict`, Web Crypto global e imports locais. Nao importar Deno,
URLs `https:` nem o teste Deno preexistente do catalogo.

### Comando

```powershell
node --test supabase/functions/_shared/reconcile-auth.test.ts
```

Resultado inicial esperado: falha porque o helper ainda nao existe.

## 3. Implementar o helper isolado

### Arquivo novo

`supabase/functions/_shared/reconcile-auth.ts`

### Responsabilidades

- constantes do protocolo: versao, caminho, limite de 1 KiB e skew de 120 s;
- parser estrito de secret hex em `Uint8Array(32)`;
- leitura limitada do corpo, inclusive quando nao houver `Content-Length`;
- validacao de objeto JSON vazio e canonizacao para `{}`;
- SHA-256 do corpo canonico;
- montagem exata das cinco linhas da mensagem;
- uso do pathname real da requisicao, rejeicao de query string e ausencia de
  newline depois da quinta linha;
- exigencia de `Content-Type: application/json`, aceitando parametro de charset
  somente se continuar sendo JSON;
- HMAC-SHA256 com Web Crypto;
- comparacao constante de dois digests de 32 bytes;
- verificacao contra secret atual e anterior sem curto-circuito que revele qual
  chave foi aceita;
- retorno tipado e generico, sem banco, rede externa, logs ou acesso a
  `Deno.env`.

O relogio e os secrets serao dependencias recebidas como parametros para testes
deterministicos. Nao adicionar pacote externo.

### Gate

Executar novamente:

```powershell
node --test supabase/functions/_shared/reconcile-auth.test.ts
```

Todos os testes criptograficos e de parsing devem passar.

## 4. Integrar o gate no handler

### Arquivo alterado

`supabase/functions/reconcile-stale-payments/index.ts`

### Ordem obrigatoria

1. recusar metodo diferente de `POST`;
2. carregar `RECONCILE_CRON_HMAC_SECRET_CURRENT` e o secret anterior opcional
   somente dentro do atendimento da requisicao;
3. falhar com `503` se o atual estiver ausente ou malformado;
4. falhar com `503` se `PREVIOUS`, quando nao vazio, estiver malformado;
5. validar headers, timestamp, content type, path sem query, corpo e HMAC;
6. retornar `400`/`401` generico quando o gate falhar;
7. somente depois ler e validar `MP_ACCESS_TOKEN` e a configuracao
   administrativa;
8. somente depois chamar `createClient`;
9. somente depois consumir `consumeDurableLimit`;
10. preservar a logica atual de reconciliacao.

Remover o comentario que descreve a rota como publica. Nao registrar headers,
corpo, URL completa, IP ou identificadores. Preservar apenas contagens finais.

### Header de verificacao

Respostas produzidas depois de autenticacao bem-sucedida devem incluir:

```text
x-druza-reconciler-auth: v1
```

O header nao contem segredo nem identificador pessoal. Ele servira para
correlacionar respostas naturais do `pg_net` sem consultar o corpo. Respostas
pre-auth, inclusive `400`, `401` e configuracao HMAC ausente, nao devem inclui-lo.

### Testes adicionais

Adicionar ao teste uma verificacao estatica focalizada no arquivo `index.ts`:

- a chamada real a autenticacao aparece antes de `hasSupabaseAdminConfig()`;
- aparece antes de qualquer `Deno.env.get('MP_ACCESS_TOKEN')`;
- aparece antes de `const admin = createClient(`;
- aparece antes de `consumeDurableLimit(`;
- todos os `console.*` do handler e helpers sao revisados;
- nao ha log de header, body, URL, IP, secret, assinatura, `user_id`,
  `order_id`, `payment_id`, email, CPF, perfil ou objetos de negocio/erro que
  encapsulem payloads.

Essa verificacao complementa os testes do helper e impede reordenacao acidental
do boundary privilegiado.

## 5. Assinar o cron e criar smoke test SQL

### Arquivo alterado

`db/schedule-payment-reconciliation.sql`

### Implementacao

1. Manter `pg_cron` em `pg_catalog`, `pg_net` e `pgcrypto` em `extensions`, e
   Supabase Vault em `vault`.
2. Antes de reagendar, usar bloco PL/pgSQL que exija exatamente um secret
   `druza_reconcile_cron_hmac` e valide `^[0-9a-f]{64}$`.
3. Preservar o nome e o intervalo `*/5 * * * *`.
4. Agendar um bloco `DO $reconcile$ ... $reconcile$` dentro do delimitador
   externo `$job$`, evitando conflito de dollar-quoting. A cada execucao, ele:
   - use `SELECT ... INTO STRICT` em `vault.decrypted_secrets`;
   - revalide o formato do secret;
   - derive timestamp Unix inteiro do relogio do banco;
   - monte a mesma mensagem canonica do TypeScript;
   - use `extensions.hmac(convert_to(..., 'UTF8'),
     decode(v_secret, 'hex'), 'sha256')`;
   - envie `x-druza-timestamp`, `x-druza-signature` e Content-Type;
   - envie somente `{}` com timeout de 15 segundos.
5. Se o secret estiver ausente, duplicado ou invalido, o `DO` deve falhar sem
   chamar `net.http_post`.
6. Nao criar funcao publica nem `SECURITY DEFINER`.

### Arquivo novo

`db/schedule-payment-reconciliation-smoke-test.sql`

### Invariantes

- schemas e versoes minimas das extensoes;
- existencia e assinatura compativel de `cron.alter_job` para rollback;
- vetor sintetico HMAC identico ao teste TypeScript;
- exatamente um secret com nome esperado;
- formato do secret validado internamente, retornando somente boolean/NOTICE
  generico;
- job unico, ativo e com intervalo correto;
- comando contem Vault, `extensions.hmac`, path e os dois headers;
- comando nao contem `Authorization`, `apikey`, `service_role`, `sb_secret_` ou
  chave literal;
- comparacao interna prova que o valor real nao aparece em `cron.job.command`,
  sem retornar nenhum dos dois textos;
- nenhum teste chama `net.http_post`.

## 6. Atualizar configuracao e documentacao operacional

### Arquivos

- `supabase/config.toml`;
- `README.md`;
- `docs/BACKEND-SETUP.md`;
- `docs/CATALOGO-E-ESTOQUE.md`;
- `docs/ATUALIZACAO-SEGURANCA-P1A-2026-07-22.md`.

### Conteudo

- explicar que `verify_jwt = false` e intencional porque o handler valida HMAC;
- remover qualquer afirmacao de que o endpoint e publico por necessidade;
- documentar nomes dos secrets, nunca valores;
- documentar a ordem Vault/cron/deploy;
- documentar rotacao `CURRENT`/`PREVIOUS`;
- documentar rollback fail-closed por desativacao do cron;
- registrar comandos somente com placeholders ou nomes;
- separar claramente verificacao local, mutacao remota e observacao natural.

O relatorio P1A deve ser iniciado localmente, mas so receber status final,
versoes remotas e resultados de producao depois da verificacao natural.

## 7. Validacao local e revisao independente

### Comandos

```powershell
node --test supabase/functions/_shared/reconcile-auth.test.ts
```

```powershell
rg -n --glob '!tmp/**' --glob '!.playwright-cli/**' "RECONCILE_CRON_HMAC|x-druza-signature|x-druza-timestamp|reconcile-stale-payments" supabase db README.md docs
```

```powershell
git diff --check -- supabase/functions/_shared/reconcile-auth.ts supabase/functions/_shared/reconcile-auth.test.ts supabase/functions/reconcile-stale-payments/index.ts supabase/config.toml db/schedule-payment-reconciliation.sql db/schedule-payment-reconciliation-smoke-test.sql README.md docs/BACKEND-SETUP.md docs/CATALOGO-E-ESTOQUE.md docs/ATUALIZACAO-SEGURANCA-P1A-2026-07-22.md
```

### Buscas defensivas

- nenhum valor de 64 hex fora do vetor sintetico explicitamente rotulado nos
  testes;
- nenhuma chave administrativa adicionada ao cron;
- nenhuma chamada manual/curl ao reconciliador documentada como teste;
- nenhum log de material autenticador, identificador pessoal ou identificador
  de pedido/pagamento;
- `verify_jwt = false` somente com comentario explicativo;
- imports remotos existentes continuam versionados/pinados.

### Revisores

1. Revisor de seguranca: autenticacao, timing, replay, ordem do boundary e
   vazamento de segredo.
2. Revisor backend/Supabase: SQL, schemas, Vault, `pg_cron`, `pg_net` e
   compatibilidade de encoding.
3. Revisor principal: escopo, testes, ordem de deploy e isolamento do commit.

Nenhuma mutacao remota antes de os tres gates darem GO.

## 8. Commit local pre-deploy

1. Preparar no indice somente os arquivos P1A listados neste plano.
2. Confirmar `git diff --cached --name-status` e `--check`.
3. Criar commit isolado, sugerido:

```text
security: autentica reconciliador com HMAC
```

4. Registrar o hash que sera publicado.
5. Nao fazer push sem pedido explicito.

## 9. Provisionar o segredo sem expo-lo

### Precondicoes

- commit pre-deploy aprovado;
- sessao autenticada do usuario no Dashboard oficial do projeto correto;
- nenhum secret duplicado;
- aprovacao para gravar os dois secrets no Dashboard;
- automacao do navegador capaz de avaliar JavaScript sem retornar o valor.

### Procedimento

Usar exclusivamente as paginas oficiais **Edge Functions > Secrets** e
**Database > Vault** no mesmo tab autenticado do Dashboard. A automacao deve:

1. gerar 32 bytes com `window.crypto.getRandomValues` dentro da pagina e
   converter para 64 hex lowercase;
2. guardar temporariamente o valor apenas em `sessionStorage` sob uma chave
   aleatoria do proprio tab;
3. preencher e salvar `RECONCILE_CRON_HMAC_SECRET_CURRENT` na pagina de Edge
   secrets sem ler ou retornar o campo;
4. navegar, no mesmo origin/tab, para o Vault e criar ou atualizar
   `druza_reconcile_cron_hmac` com o valor recuperado em memoria;
5. preservar a entrada existente do Vault em rotacao, sem criar nome duplicado;
6. remover imediatamente a chave temporaria de `sessionStorage`, limpar os
   campos e navegar para uma pagina sem formulario de segredo;
7. retornar das avaliacoes somente booleanos de sucesso e nomes publicos, nunca
   o valor, comprimento parcial, prefixo, sufixo ou hash reutilizavel;
8. nao fazer screenshot enquanto um campo de valor estiver preenchido.

Nao usar CLI, SQL Editor, argumento de processo, arquivo temporario, clipboard,
historico de shell ou Management API manual para provisionar o valor. Antes do
secret real, validar o fluxo de memoria/limpeza com um sentinel sintetico em uma
pagina local, e confirmar que o sentinel nao aparece em stdout/stderr,
transcript, repo ou artefatos do navegador.

Verificar apenas:

- nome publico e presenca do Edge secret, sem retornar valor, prefixo ou digest;
- contagem `1` no Vault;
- formato valido como boolean;
- conclusao bem-sucedida dos dois formularios que receberam o mesmo valor da
  memoria do tab;
- ausencia da chave temporaria em `sessionStorage`.

Se a sessao nao estiver autenticada, as paginas mudarem ou o fluxo nao concluir
os dois writes e a limpeza no mesmo tab, parar e solicitar a intervencao do
usuario. A primeira execucao natural autenticada sera a comprovacao ponta a
ponta, sem revelar o valor.

## 10. Atualizar cron e publicar imediatamente o handler

### 10.1 Migracao do cron

Aplicar `db/schedule-payment-reconciliation.sql` como migracao nomeada:

```text
secure_reconcile_stale_payments_hmac
```

Usar a ferramenta callable `mcp__codex_apps__supabase_apply_migration` com o
conteudo revisado do arquivo. Confirmar o registro com
`mcp__codex_apps__supabase_list_migrations`. Isso cria historico de migration no
projeto remoto. O repositorio atual mantem SQL operacional versionado em `db/`
e nao possui `supabase/migrations`; iniciar uma trilha local incompleta fica fora
deste P1A. O SQL deve ler o secret do Vault e nunca contem seu valor.

### 10.2 Gate intermediario somente de metadados

Sem esperar o proximo ciclo:

- confirmar job unico/ativo;
- confirmar os booleanos de Vault/HMAC/headers;
- confirmar ausencia de credencial literal;
- nao executar o job manualmente.

### 10.3 Deploy imediato

Publicar somente `reconcile-stale-payments` com `verify_jwt: false`. O call de
`deploy_edge_function` deve enviar o conteudo completo, nao apenas os nomes, do
entrypoint e de todas as dependencias relativas:

- `index.ts`;
- `_shared/reconcile-auth.ts`;
- `_shared/rate-limit.ts`;
- `_shared/payment.ts`;
- `_shared/supabase-env.ts`.

Preferir `deploy_edge_function` do conector Supabase, que faz bundle antes de
ativar a nova versao. Como fallback, usar o CLI 2.109.0 com as flags confirmadas:

```powershell
supabase.cmd functions deploy reconcile-stale-payments --project-ref hqkpgghlbwincahfwkem --no-verify-jwt --use-api
```

Nao usar `--prune`. Confirmar nova versao ativa com `get_edge_function`; obter
`verify_jwt` de `list_edge_functions` ou metadado equivalente, nao inferi-lo do
codigo-fonte.

## 11. Verificacao natural sem dados pessoais

### Observacao

Esperar duas execucoes naturais consecutivas. Nao usar `sleep` bloqueante maior
que 60 segundos; fazer checagens curtas e comunicar o progresso.

### Consultas permitidas

Selecionar somente:

- horario e status do `cron.job_run_details` para o job aprovado;
- `created` e `status_code` de `net._http_response` cuja resposta contenha o
  header `x-druza-reconciler-auth: v1`; o predicate deve comparar internamente
  as chaves JSONB em lowercase, sem selecionar ou retornar o objeto `headers`;
- versao/estado/`verify_jwt` da Edge Function;
- booleanos do smoke test SQL;
- Security Advisor depois da mudanca.

Nao selecionar `content`, request headers, corpos, logs amplos ou qualquer
registro de negocio.

### Criterio de sucesso

- duas respostas naturais consecutivas identificadas pelo header;
- pelo menos uma com HTTP `200`;
- a outra pode ser `200` ou `202` somente se houver sobreposicao legitima;
- nenhuma resposta pre-auth identificada como autenticada;
- smoke SQL integralmente aprovado;
- nenhum novo advisor de banco causado pela entrega.

## 12. Relatorio final e commit pos-deploy

1. Completar `docs/ATUALIZACAO-SEGURANCA-P1A-2026-07-22.md` com:
   - hash local publicado;
   - versao remota;
   - migracao aplicada;
   - somente horarios/status das duas execucoes;
   - advisors e riscos residuais;
   - risco residual de o secret customizado pertencer ao ambiente de Edge
     Functions do projeto, apesar de conceder somente a capacidade HMAC;
   - confirmacao de zero chamada manual, zero RPC manual e zero PII acessada.
2. Reexecutar testes locais, smoke de metadados e `git diff --check`.
3. Solicitar gate final independente.
4. Commitar somente o relatorio e qualquer ajuste P1A necessario, sem push.
5. Entregar checklist priorizado do proximo P1; nao iniciar outro subprojeto sem
   novo ciclo de desenho/aprovacao.

## Stop conditions e rollback

### Antes do deploy do handler

- Edge secret e Vault nao sincronizados: parar; nao alterar cron.
- Migracao do cron falhou: parar e revisar; nao publicar o handler autenticado.
- Deploy falhou durante bundle: a versao anterior permanece; tentar no maximo
  mais duas abordagens documentadas e depois reportar o bloqueio.

### Depois do deploy do handler

- Cron retorna `401`, nao produz header autenticado ou falha por secret:
  desativar o job pelo `jobid` usando a assinatura exata de `cron.alter_job`
  confirmada no preflight, sem improvisar a chamada durante o incidente.
- Manter o handler autenticado ativo.
- Corrigir secret, encoding, relogio ou mensagem canonica.
- Reativar o job e observar duas novas execucoes naturais.
- Nunca republicar a versao sem autenticacao.

### Suspeita de vazamento

- Desativar o cron.
- Rotacionar `CURRENT`/`PREVIOUS` conforme a especificacao.
- Revogar o valor comprometido dos dois lados.
- Nao registrar o valor antigo em incidentes ou relatorios.

## Ordem obrigatoria

1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12.

Nenhum passo remoto pode ser antecipado para compensar falha de teste ou de
revisao local.

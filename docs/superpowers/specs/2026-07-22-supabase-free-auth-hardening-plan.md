# Plano de implementacao - hardening de Auth no Supabase Free

Baseado em
[2026-07-22-supabase-free-auth-hardening-design.md](./2026-07-22-supabase-free-auth-hardening-design.md).

## Objetivo

Adicionar Cloudflare Turnstile aos quatro pontos publicos de entrada do Auth,
elevar novas senhas para 12 caracteres, consultar o Pwned Passwords por
k-anonymity e corrigir a autorizacao da pagina de recovery. A entrega deve
preservar login com senha legada, MFA/AAL2 administrativo e a usabilidade do
site, sem contratar Supabase Pro, abrir dados de usuarios ou expor credenciais.

## Ambiente e estado confirmados

- Workspace: `C:\Users\KABUM\Desktop\Druza_site`.
- Projeto Supabase autorizado: `hqkpgghlbwincahfwkem`.
- Branch: `main`, atualmente dez commits a frente de `origin/main` antes deste
  plano.
- Site estatico, sem build, `package.json` ou suite de testes existente.
- Node.js: `v24.16.0`; os testes usarao somente modulos nativos.
- Preview local: `python -m http.server 5510`, acessado por
  `http://localhost:5510`, nunca por `file://`.
- SDK preservado em `@supabase/supabase-js@2.45.0`, com o SRI atual.
- `TURNSTILE_SITE_KEY` existe e esta vazia em `js/config.public.js`; o
  comentario atual orienta a ordem insegura e sera corrigido antes do release.
- Hostnames ja cadastrados no widget: `druza.com.br`, seus subdominios e
  `brunocarreirocs.github.io`.
- A Secret Key que apareceu anteriormente foi rotacionada. O valor novo nao
  sera lido, copiado, digitado pela automacao, enviado ao chat ou versionado.
- CAPTCHA remoto esta desligado, o minimo remoto e 8 caracteres e o limite
  combinado de cadastro/login esta em 30 requisicoes por cinco minutos por IP.
- Confirmacao de e-mail, Secure Email Change, Secure Password Change, senha
  atual e TOTP administrativo permanecem habilitados.

## Guardrails obrigatorios

- Nao consultar Auth logs, usuarios, perfis, e-mails, telefones, pedidos ou
  qualquer dado pessoal remoto.
- Nao criar conta, solicitar e-mail real, redefinir senha real nem executar
  ataques, brute force ou chamadas diretas para contornar o frontend.
- Usar apenas fixtures sinteticas e clientes/fetch mockados nos testes.
- Nao registrar senha, hash completo, prefixo HIBP, token CAPTCHA, sessao ou
  resposta do HIBP em console, arquivo, storage ou telemetria.
- Nunca colocar a Secret Key do Turnstile em Git, `config.public.js`, shell,
  screenshot, documentacao, clipboard ou chat.
- A Site Key e publica, mas so entra no repositorio no gate de release e depois
  de o usuario confirmar qual e a chave atual do widget rotacionado.
- Nao habilitar CAPTCHA remoto antes de o frontend com a Site Key estar
  publicado e verificado nos tres hosts autorizados.
- Nao alterar SDK/SRI, banco, RLS, Edge Functions, `supabase/config.toml`,
  `js/admin.js`, `js/admin-panel.js`, `conta.html` ou `js/config.example.js`.
  Em `js/config.public.js`, o primeiro commit altera apenas o comentario e
  mantem a Site Key vazia; o valor publico entra somente no gate de release.
- Preservar e nao incluir nos commits as delecoes preexistentes em `tmp/` nem
  o diretorio `.playwright-cli/`.
- Nao fazer push sem autorizacao explicita. Antes de qualquer push, mostrar os
  commits que serao enviados, pois a branch ja esta a frente do remoto.
- Parar diante de divergencia de projeto, hostname, Site Key, configuracao ou
  tela do Dashboard; nao improvisar uma API ou SQL para configuracoes de Auth.

## 1. Preflight local e remoto somente de configuracao

### Arquivos e call sites

Confirmar novamente, antes de editar:

- `cadastro.html`: `signUp` ja envia `captchaToken` por logica embutida;
- `login.html`: `signIn({ email, password })`;
- `admin-login.html`: `A.signIn({ email, password })`;
- `recuperar-senha.html`: `requestPasswordReset(email)`;
- `redefinir-senha.html`: `onAuthChange`, `updatePassword` e a condicao
  insegura que aceita `SIGNED_IN`;
- `admin-login.html`, `conta.html` e `js/admin-panel.js`: chamadas atuais de
  `signOut()` sem argumento, que devem continuar globais.

### Acoes

1. Registrar `git status --short --branch` com exclusao visual de `tmp/` e
   `.playwright-cli/`, sem reverter mudancas preexistentes.
2. Confirmar que `js/config.public.js` ainda contem somente a Site Key vazia e
   nenhuma Secret Key; registrar que o comentario atual precisa inverter a
   ordem para "publicar Site Key antes de habilitar CAPTCHA remoto".
3. Confirmar por busca estatica que nao existe CSP em meta tag no HTML. Na
   fase publicada, verificar tambem o header de resposta de cada host.
4. No Dashboard autenticado, ler somente os nomes e valores de configuracao
   visiveis de CAPTCHA, politica de senha e rate limit; nao abrir usuarios ou
   logs.
5. Registrar como baseline: CAPTCHA desligado, minimo 8 e taxa sustentada
   30/5 minutos/IP. Se a tela viva divergir, interromper antes de editar.
6. Confirmar que o projeto continua no plano Free e que leaked-password
   protection nativa continua indisponivel; nao tentar habilitar um controle
   pago.
7. Ler somente a configuracao de Site URL/Redirect URLs e comparar com os
   destinos exatos produzidos por `baseUrl()` nas paginas publicadas:
   `login.html` para confirmacao de cadastro e `redefinir-senha.html` para
   recovery, nos origins `druza.com.br`, `www.druza.com.br` e no path real do
   GitHub Pages. Nao adivinhar o slug nem ampliar a allowlist com wildcard
   generico.

### Gate

Prosseguir somente se o projeto for `hqkpgghlbwincahfwkem`, CAPTCHA continuar
desligado, a configuracao local nao contiver segredo e as Redirect URLs exatas
estiverem presentes ou tiverem uma correcao restrita preparada para o gate de
release. Nenhuma mutacao remota ocorre nesta etapa.

## 2. Criar testes falhando para o modulo de seguranca

### Arquivo novo

`tests/auth-security.test.js`

### Estrategia

Carregar `js/auth-security.js` em `node:vm` com `window`, `document`,
`fetch`, Web Crypto, timers e Turnstile falsos injetados. Nao adicionar pacote
ou fazer requisicao de rede.

### Casos HIBP obrigatorios

- SHA-1 de um vetor sintetico conhecido, em UTF-8, com hash hexadecimal
  uppercase e separacao exata em prefixo de cinco caracteres e sufixo;
- URL contem somente o prefixo de cinco caracteres e nunca a senha, o hash
  completo ou identificador pessoal;
- `Add-Padding: true`, `cache: 'no-store'` e
  `referrerPolicy: 'no-referrer'` enviados;
- resposta valida sem sufixo correspondente retorna `safe`;
- sufixo correspondente com contagem maior que zero retorna `pwned` sem
  devolver a contagem;
- linha de padding ou correspondencia com contagem zero nao retorna `pwned`;
- parsing aceita CRLF e caixa hexadecimal sem relaxar o formato da contagem;
- HTTP diferente de 200, rede/CORS, abort, timeout de cinco segundos,
  `crypto.subtle` ausente e resposta malformada retornam `unavailable`;
- nenhum estado retornado inclui senha, hash, prefixo, sufixo ou corpo remoto.

### Casos Turnstile obrigatorios

- Site Key vazia produz controlador inativo e nao bloqueia o formulario;
- varias inicializacoes compartilham uma unica carga do script oficial;
- Site Key presente usa renderizacao explicita em modo Managed;
- callback de sucesso armazena somente o token atual em memoria;
- expiracao, callback de erro e `reset()` invalidam imediatamente o token;
- falha de carga fica visivel como estado recuperavel; uma acao explicita de
  retry limpa a promise rejeitada e tenta carregar/renderizar novamente sem
  reload;
- `reset()` depois de uma requisicao chama o widget correto e nao afeta outro
  formulario/controlador.

### Comando RED

```powershell
node --test tests/auth-security.test.js
```

Resultado inicial esperado: falha porque `js/auth-security.js` ainda nao
existe. Nao avancar sem confirmar que os testes falham pela razao esperada.

## 3. Implementar `js/auth-security.js`

### Arquivo novo

`js/auth-security.js`

### Estrutura

Usar IIFE compativel com o navegador e uma factory testavel por Node. No site,
o unico global novo sera `window.DruzaAuthSecurity`; no teste, a mesma factory
recebera dependencias sinteticas. O modulo nao importara Supabase nem tocara em
perfil, sessao, local/session storage ou cookies.

### API publica planejada

- `createTurnstileController({ container, statusElement })`;
- controlador com `init()`, `retry()`, `isActive()`, `isReady()`, `getToken()`
  e `reset()`;
- `checkPwnedPassword(password)`, retornando somente
  `{ status: 'safe' | 'pwned' | 'unavailable' }`.

Nomes podem ser refinados durante a implementacao, mas os testes e os cinco
arquivos consumidores devem usar uma unica API compartilhada; nao duplicar
loader ou parser nas paginas.

### HIBP

1. Codificar a senha com `TextEncoder` e calcular SHA-1 localmente com
   `crypto.subtle.digest`.
2. Enviar somente os cinco primeiros caracteres do hash para
   `https://api.pwnedpasswords.com/range/{prefix}`.
3. Usar `AbortController` e timer de cinco segundos, sempre limpando o timer.
4. Fazer parsing em memoria, comparando apenas o sufixo restante.
5. Retornar `pwned` apenas para contagem inteira maior que zero.
6. Falhar aberto como `unavailable` para qualquer indisponibilidade ou formato
   inesperado; nunca lancar material derivado da senha em mensagem de erro.

### Turnstile

1. Ler apenas `DRUZA_CONFIG.TURNSTILE_SITE_KEY`.
2. Manter uma promise singleton para o script
   `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`.
3. Se a Site Key estiver vazia, manter o wrapper oculto e o controlador
   inativo.
4. Se estiver presente, revelar o wrapper, carregar/renderizar o widget e
   atualizar uma regiao `aria-live` com estado neutro.
5. Nao enviar Auth enquanto um controlador ativo estiver sem token.
6. Limpar o token em sucesso usado, expiracao, erro e reset.
7. Em falha do loader, descartar a promise singleton rejeitada; `retry()` cria
   uma tentativa nova e nunca reutiliza token/widget parcial.
8. Nao usar `data-callback` inline nem criar um loader separado por pagina.

### Gate GREEN

```powershell
node --check js/auth-security.js
node --test tests/auth-security.test.js
```

Todos os casos devem passar sem acesso de rede.

## 4. Criar testes de contrato para `js/auth.js`

### Arquivo novo

`tests/auth.test.js`

Executar `js/auth.js` em `node:vm` com `window.supabase.createClient` e cliente
Auth integralmente mockados. Usar dados sinteticos que atendam aos validadores,
sem conexao com o projeto remoto.

### Contratos obrigatorios

- `signUp` preserva os metadados atuais e envia `captchaToken` dentro de
  `options`;
- `signIn({ email, password, captchaToken })` envia `options.captchaToken`
  dentro do objeto de credenciais esperado pelo SDK 2.45.0;
- `requestPasswordReset(email, captchaToken)` envia `captchaToken` no segundo
  objeto de opcoes junto com `redirectTo`;
- token vazio vira `undefined`, mantendo compatibilidade enquanto CAPTCHA
  remoto estiver desligado;
- `signOut()` chama o SDK sem opcoes e preserva o logout global atual;
- `signOut({ scope: 'local' })` encaminha exatamente esse escopo;
- `signOut` devolve erro mapeado sem quebrar os consumidores atuais que
  ignoram o retorno;
- retorno `{ data: { weakPassword: ... }, error: null }` continua sendo
  sucesso, preserva `data` e nao vira bloqueio;
- politica local e mapeamento remoto informam minimo de 12, nao 8;
- `mapError` prioriza `error.code` para CAPTCHA, rate limit e senha fraca, com
  fallback pela mensagem apenas para compatibilidade;
- `captcha_failed`, `over_request_rate_limit`,
  `over_email_send_rate_limit` e `weak_password` produzem as mensagens neutras
  esperadas; o aviso de login em `data.weakPassword` continua fora do canal de
  erro;
- `SIGNED_IN` comum nunca marca recovery;
- `PASSWORD_RECOVERY` marca somente um booleano em memoria e e entregue mesmo
  se ocorrer entre a carga do SDK e o subscriber da pagina;
- o novo buffer guarda somente o booleano de recovery; a API existente pode
  continuar entregando a sessao ao callback, mas o novo codigo nao a registra
  nem a persiste.

### Comando RED

```powershell
node --test tests/auth.test.js
```

Confirmar falhas apenas nos contratos novos antes de alterar `js/auth.js`.

## 5. Adaptar `js/auth.js` sem quebrar consumidores

### Arquivo alterado

`js/auth.js`

### Alteracoes

1. Trocar o minimo da politica local e todas as mensagens correspondentes de
   8 para 12; manter maximo 72, classes, ausencia de espacos e validacoes de
   contexto do cadastro.
2. Fazer `mapError` consultar primeiro `error.code` e depois a mensagem.
   Cobrir explicitamente CAPTCHA, rate limit e `weak_password`; manter texto
   neutro de nova verificacao sem indicar se a conta existe ou se a senha
   estava correta. `data.weakPassword` com `error: null` nao passa por
   `mapError`.
3. Ampliar `signIn` com `captchaToken` opcional e montar a assinatura exata do
   SDK.
4. Ampliar `requestPasswordReset` com o segundo parametro opcional e manter o
   `redirectTo` atual.
5. Ampliar `signOut(options)`; sem argumento, chamar `client.auth.signOut()`;
   com argumento, encaminhar o objeto e devolver o erro mapeado. Chamadas
   existentes permanecem sem argumento/global e podem continuar ignorando o
   retorno.
6. Preservar `data` integral de `signIn`, inclusive `data.weakPassword`, quando
   `error` for nulo.
7. Instalar um unico observador Auth assim que o cliente for criado. Guardar
   apenas `recoverySeen: boolean` ao receber `PASSWORD_RECOVERY`, distribuir
   eventos aos subscribers e permitir que a pagina consulte/reproduza esse
   estado para eliminar a corrida. `SIGNED_IN` nao altera o booleano.
8. Fazer `onAuthChange` continuar atendendo o consumidor atual e retornar uma
   forma de unsubscribe para o novo fluxo, sem registrar sessao.

### Gate

```powershell
node --check js/auth.js
node --test tests/auth.test.js
```

Nao alterar os call sites de `signOut()` em `admin-login.html`, `conta.html` ou
`js/admin-panel.js`; os testes devem comprovar a compatibilidade.

## 6. Integrar Turnstile nos quatro formularios

### Arquivos alterados

- `cadastro.html`;
- `login.html`;
- `admin-login.html`;
- `recuperar-senha.html`;
- `css/account.css`.

### Markup e scripts

Adicionar o mesmo bloco semantico a cada formulario: wrapper de seguranca,
container do widget, texto de estado com `aria-live="polite"` e botao
`type="button"` de tentar novamente, inicialmente oculto. O wrapper fica
oculto somente quando a Site Key esta vazia; o retry aparece se o loader falhar.

Preservar a ordem existente de config e SDK e inserir o modulo assim:

- nas cinco paginas de Auth, inclusive `redefinir-senha.html`:
  `js/config.public.js` -> Supabase UMD 2.45.0/SRI atual ->
  `js/auth-security.js` -> `js/auth.js` -> script inline;
- admin: a mesma ordem, seguida de `js/admin.js` e do script inline.

O script inline de cada pagina cria um controlador, chama `init()` e:

1. mantem o fluxo atual quando o controlador esta inativo;
2. exige token somente quando ele esta ativo;
3. passa o token ao metodo `DruzaAuth` correto;
4. reinicia o widget em `finally` depois de toda tentativa que chegou ao
   Supabase, em sucesso ou erro;
5. nao reinicia por erro de validacao local anterior ao request;
6. mantem o botao reutilizavel e uma mensagem clara se o widget ainda nao
   carregou, expirou ou falhou;
7. liga a acao de retry a `controller.retry()` e, se o usuario submeter com o
   controlador ativo mas indisponivel, nao envia Auth e oferece essa nova
   tentativa sem exigir reload.

### Particularidades

- `cadastro.html`: remover integralmente o loader/estado Turnstile embutido e
  usar o controlador compartilhado; manter resposta anti-enumeracao.
- `login.html`: passar `captchaToken` a `signIn`; nao consultar HIBP e
  preservar `nextParam()` e o redirecionamento atual.
- `admin-login.html`: proteger somente o primeiro fator. Nao alterar consulta
  de `admins`, enrolamento/verificacao TOTP, AAL2 ou formulario de codigo.
- `recuperar-senha.html`: passar token a `requestPasswordReset`; manter sempre
  a resposta publica "Se houver uma conta..." e remover qualquer log do objeto
  de erro.

### CSS

Adicionar somente em `css/account.css` estilos reutilizaveis como
`.auth-security`, `.auth-security__widget`, `.auth-security__status` e estado
de aviso nao bloqueante. Reutilizar os estilos globais de `[hidden]`, botao
desabilitado e `.auth-feedback`; nao duplicar CSS inline nas paginas.

## 7. Integrar HIBP no cadastro e na nova senha

### Arquivos alterados

- `cadastro.html`;
- `redefinir-senha.html`.

### Ordem de submit

1. Validar todo o formulario e a politica local de 12 caracteres.
2. Executar exatamente uma `checkPwnedPassword` por submit completo, nunca por
   tecla, blur ou login.
3. Se `pwned`, bloquear aquela senha com orientacao generica para escolher uma
   senha unica; nao exibir contagem.
4. Se `unavailable`, mostrar aviso nao bloqueante em regiao dedicada e
   continuar o fluxo.
5. Se `safe`, limpar aviso anterior e continuar.

Nao consultar HIBP em `login.html`, `admin-login.html` ou
`recuperar-senha.html`. Nao memorizar resultado entre submits nem reutilizar
hash/prefixo.

## 8. Corrigir a pagina de recovery

### Arquivo alterado

`redefinir-senha.html`

### Estado e autorizacao

1. Alterar os dois `minlength` e o hint para 12.
2. Iniciar campos e submit desabilitados antes de qualquer chamada assincrona.
3. Consultar o estado bufferizado e assinar eventos do `DruzaAuth`.
4. Habilitar o formulario exclusivamente depois de `PASSWORD_RECOVERY`.
5. Remover qualquer autorizacao por `SIGNED_IN`, `getSession()` ou simples
   existencia de sessao.
6. Depois de dez segundos sem recovery, manter o formulario bloqueado, mostrar
   "link ainda nao validado", oferecer uma acao de tentar novamente e um link
   para `recuperar-senha.html`.
7. Manter o observador ativo depois do timeout; rede lenta ainda pode liberar o
   formulario quando o evento correto chegar.
8. Impedir duplo submit enquanto HIBP/update/logout estiverem em andamento.

### Conclusao

Depois de `updatePassword` ter sucesso, executar
`signOut({ scope: 'local' })` e somente entao redirecionar para `login.html`.
Se o logout local falhar, manter a pagina sem novo submit e exibir orientacao
de nova tentativa, em vez de fingir que a sessao foi encerrada.

### Gate

Criar tambem `tests/auth-pages.test.js`. Ele executara o script da pagina de
recovery em `node:vm` com DOM, timers, `DruzaAuth`, HIBP e navegacao falsos,
sem rede. Os testes mockados devem provar:

- acesso direto e `SIGNED_IN` comum mantem o formulario bloqueado;
- `PASSWORD_RECOVERY` antes ou depois do subscriber habilita uma unica vez;
- timeout nao cancela o observer;
- update nao ocorre antes do evento;
- HIBP `pwned` bloqueia e `unavailable` permite;
- logout local ocorre depois do update e antes do redirect.

Os demais formularios podem ser cobertos por contratos e invariantes
estaticos; a pagina de recovery recebe o harness dinamico por concentrar a
maior mudanca de estado e autorizacao.

## 9. Criar testes estaticos de integracao

### Arquivo novo

`tests/auth-hardening-static.test.js`

Usar `node:test`, `node:assert/strict` e `node:fs`, sem parser externo.

### Invariantes

- as cinco paginas carregam `js/auth-security.js` na ordem aprovada; as quatro
  paginas de entrada possuem bloco Turnstile e passam o token ao metodo
  correto;
- os quatro blocos possuem retry `type="button"` ligado ao controlador e nao
  enviam Auth enquanto um controlador ativo estiver indisponivel;
- `cadastro.html` nao contem mais loader Turnstile duplicado;
- `redefinir-senha.html` nao possui widget, nao aceita `SIGNED_IN` e chama
  HIBP, atualiza a senha e chama logout local nessa ordem;
- cadastro e redefinicao usam 12 em atributos/hints; `js/auth.js` nao contem a
  mensagem antiga de minimo 8;
- login e admin nao chamam HIBP;
- o SDK 2.45.0, o `integrity` e `crossorigin` atuais permanecem identicos;
- `privacidade.html` identifica Cloudflare Turnstile e HIBP e descreve somente
  categorias/finalidades aprovadas;
- nenhum arquivo publico contem configuracao com nome de Secret Key;
- `js/config.public.js` orienta Site Key antes da ativacao remota e permanece
  com valor vazio no commit pre-deploy;
- nenhum `console.*` recebe password, hash, prefix, suffix, captchaToken,
  token Turnstile ou resposta HIBP;
- nenhum teste contem conta, e-mail ou senha real e nenhum fetch nao mockado e
  executado.

### Suite completa

```powershell
node --check js/auth-security.js
node --check js/auth.js
node --test tests/auth-security.test.js tests/auth.test.js tests/auth-pages.test.js tests/auth-hardening-static.test.js
```

## 10. Atualizar privacidade e documentacao

### Arquivos alterados

- `privacidade.html`;
- `README.md`;
- `docs/BACKEND-SETUP.md`;
- `js/config.public.js` (somente comentario nesta fase; valor continua vazio);
- `docs/ATUALIZACAO-SEGURANCA-P1-AUTH-FREE-2026-07-22.md` (novo).

### Conteudo

- Turnstile: finalidade antiabuso, comunicacao com Cloudflare, sinais tecnicos
  de rede/navegador e token encaminhado ao Supabase para validacao;
- HIBP: prefixo de cinco caracteres do SHA-1, metadados normais de HTTPS,
  ausencia de senha/hash completo/e-mail/telefone/nome/ID e fail-open;
- politica de 12 caracteres e preservacao do login legado;
- arquivos compartilhados, comandos de teste e ordem de scripts;
- Site Key publica versus Secret Key exclusiva do Dashboard;
- comentario de `TURNSTILE_SITE_KEY` corrigido para exigir publicar/verificar a
  chave publica antes de habilitar Turnstile no Supabase;
- Redirect URLs exatas para confirmacao e recovery em cada host/path, sem
  wildcard amplo;
- sequencia obrigatoria de deploy, ativacao e rollback;
- limitacao residual: o controle HIBP no cliente e contornavel e o Advisor
  nativo de leaked passwords pode continuar alertando no Free;
- roteiro do proprietario para fluxos positivos, sem compartilhar credenciais.

Nao afirmar certificacao juridica, anonimato absoluto ou protecao equivalente
ao recurso nativo pago.

## 11. Validacao local sem Site Key de producao

### Comandos

```powershell
node --check js/auth-security.js
node --check js/auth.js
node --test tests/auth-security.test.js tests/auth.test.js tests/auth-pages.test.js tests/auth-hardening-static.test.js
```

```powershell
python -m http.server 5510
```

### Navegacao local

Em `http://localhost:5510`, com `TURNSTILE_SITE_KEY` vazia e CAPTCHA remoto
desligado, verificar sem submeter credenciais:

- as cinco paginas abrem sem erro de JavaScript;
- o wrapper Turnstile permanece oculto nos quatro formularios;
- os botoes e layouts permanecem usaveis em desktop e viewport movel;
- `redefinir-senha.html` inicia bloqueada e mostra o fallback depois de dez
  segundos;
- links de login/cadastro/recovery e `next` continuam locais.

O Turnstile real nao sera executado em localhost. Loader, token, expiracao,
erro e retry serao cobertos por mocks; a chave real sera testada somente nos
hosts autorizados publicados.

### Buscas defensivas

```powershell
rg -n --glob '!tmp/**' --glob '!.playwright-cli/**' "TURNSTILE|captchaToken|pwnedpasswords|PASSWORD_RECOVERY|weakPassword" js tests cadastro.html login.html admin-login.html recuperar-senha.html redefinir-senha.html privacidade.html README.md docs
```

```powershell
git diff --check -- js/auth-security.js js/auth.js css/account.css cadastro.html login.html admin-login.html recuperar-senha.html redefinir-senha.html privacidade.html tests README.md docs/BACKEND-SETUP.md docs/ATUALIZACAO-SEGURANCA-P1-AUTH-FREE-2026-07-22.md
```

Revisar manualmente cada resultado sensivel; uma busca por nome nao autoriza
imprimir valores de secret ou token.

## 12. Revisao independente e commit pre-deploy

### Revisores

1. Seguranca: k-anonymity, fail-open limitado, logs, enumeracao, recovery e
   ausencia de secret.
2. Frontend/Auth: contratos Supabase 2.45.0, call sites, Turnstile, estados de
   erro e acessibilidade.
3. Revisor principal: escopo, testes, diff, ordem de release e rollback.

Todos devem dar GO antes de qualquer configuracao remota.

### Commit

1. Adicionar ao indice somente os arquivos desta entrega. Incluir em
   `js/config.public.js` apenas a correcao do comentario e comprovar que
   `TURNSTILE_SITE_KEY` continua vazia nesta fase.
2. Conferir `git diff --cached --name-status` e `git diff --cached --check`.
3. Criar commit isolado, sugerido:

```text
security: endurece autenticacao no plano free
```

4. Registrar o hash; nao fazer push.

## 13. Gate de release da Site Key publica

### Precondicoes

- suite e revisoes aprovadas;
- CAPTCHA remoto ainda desligado;
- usuario confirma somente a Site Key publica atual;
- Secret Key permanece desconhecida pela implementacao;
- widget Cloudflare continua limitado a `druza.com.br`/subdominios e
  `brunocarreirocs.github.io`.
- Site URL permanece no canonical autorizado e Redirect URLs contem exatamente
  os destinos de `login.html` e `redefinir-senha.html` calculados nos tres
  hosts/paths.

### Mudanca

Se faltar algum destino, adicionar somente a Redirect URL exata no Dashboard e
confirmar a allowlist antes de continuar. Depois, preencher apenas
`TURNSTILE_SITE_KEY` em `js/config.public.js`, executar testes estaticos e criar
um segundo commit isolado:

```text
config: define site key publica do turnstile
```

Site Key publica nao deve ser confundida com Secret Key. Se o valor recebido
for rotulado como secret ou houver duvida, nao gravar e pedir que o usuario
copie somente o campo **Site key** do Cloudflare.

## 14. Publicar o frontend compativel

### Autorizacao de push

Antes do push:

1. listar `origin/main..HEAD` e os arquivos dos commits a enviar;
2. informar que todos os commits locais a frente serao publicados, nao apenas
   o ultimo;
3. pedir autorizacao explicita para `git push origin main`;
4. sem essa autorizacao, parar com os commits apenas locais.

### Verificacao publicada com CAPTCHA remoto ainda desligado

Depois da publicacao, verificar por navegador, sem preencher credenciais:

- `cadastro.html`, `login.html`, `admin-login.html` e
  `recuperar-senha.html` em `https://druza.com.br`;
- as mesmas rotas em `https://www.druza.com.br`;
- as mesmas rotas sob o path publicado em
  `https://brunocarreirocs.github.io`.

Para cada host, confirmar:

- widget renderizado, estado acessivel e layout integro;
- token de sucesso gerado pelo widget sem ser impresso;
- ausencia de erro de hostname, script, frame, connect ou console;
- SDK/SRI e demais scripts carregados;
- CSP ausente ou, se existir em header/meta, permissiva para
  `challenges.cloudflare.com`, `api.pwnedpasswords.com` e Supabase.

### Stop condition

Nao abrir o campo de Secret Key nem habilitar CAPTCHA se qualquer pagina/host
falhar. Reverter somente `TURNSTILE_SITE_KEY` para vazio, publicar o rollback e
manter CAPTCHA remoto desligado enquanto a causa e corrigida.

## 15. Habilitar Turnstile no Supabase

### Procedimento manual protegido

1. Abrir o projeto correto em Authentication > Bot and Abuse Protection.
2. Selecionar Cloudflare Turnstile.
3. Entregar o controle ao usuario para colar a Secret Key rotacionada
   diretamente no campo do Dashboard.
4. Nao ler o campo, executar JavaScript sobre ele, usar clipboard, tirar
   screenshot ou retornar qualquer parte do valor.
5. Depois de o usuario confirmar que salvou, verificar apenas o provedor
   selecionado e o estado **enabled**; a evidencia nao deve conter o campo.

### Gate imediato

Verificar novamente que os widgets continuam renderizando nos tres hosts. Nao
forjar token, remover token pelo DevTools nem chamar endpoints Auth diretamente.
A fronteira remota sera comprovada pelo estado do Dashboard e pelo fluxo
positivo obrigatorio do proprietario; os casos negativos ficam cobertos por
mocks para respeitar a proibicao de ataques.

Antes de alterar minimo de senha ou rate limit, o proprietario deve, com uma
conta propria ja existente e sem compartilhar credenciais, concluir login e um
recovery real ate o evento `PASSWORD_RECOVERY`, a atualizacao da senha e o
logout local. O resultado reportado sera somente passa/falha. A cota do SMTP
embutido deve ser respeitada e nenhuma nova conta sera criada. Se esse gate nao
puder ser executado ou falhar, a ativacao fica incompleta: desabilitar CAPTCHA
se houver regressao e nao avancar aos passos 16 e 17.

Se um fluxo legitimo com token valido falhar depois da ativacao, desabilitar
CAPTCHA imediatamente antes de investigar. Se a Secret Key aparecer fora do
Dashboard, parar e rotaciona-la novamente.

## 16. Elevar o minimo remoto para 12

Somente depois de Turnstile permanecer estavel:

1. abrir Password Security no mesmo projeto;
2. alterar apenas o comprimento minimo de 8 para 12;
3. manter as classes fortes ja selecionadas;
4. salvar e confirmar somente o valor de configuracao;
5. nao abrir usuarios nem tentar descobrir quem possui senha antiga.

### Gate

- testes mockados ja devem provar rejeicao de nova senha de 11 e aceite local
  de senha de 12 que cumpra as classes;
- teste mockado de `data.weakPassword` deve continuar passando;
- um login real com senha legada e apenas opcional ao proprietario, usando sua
  propria conta e sem compartilhar credenciais.

Se login legado for transformado em erro pelo frontend, desabilitar o deploy
novo/reverter o codigo; nao baixar o minimo remoto antes de confirmar a causa.

## 17. Reduzir a taxa sustentada de cadastro/login

Tratar como mudanca independente, depois de CAPTCHA e minimo 12 estaveis.

1. Abrir a pagina oficial de Rate Limits.
2. Confirmar o nome exato do campo combinado de signups/signins e o valor
   anterior 30 por cinco minutos/IP; se o campo ou unidade divergirem, parar.
3. Alterar somente esse campo para 10 por cinco minutos/IP.
4. Nao alterar o limite de e-mail, OTP, refresh token ou outros buckets.
5. Registrar configuracao antes/depois, sem IPs, logs ou tentativas de usuarios.

Nao gerar 429 deliberadamente nem executar rajadas. O token bucket pode
permitir bursts curtos; o aceite sera configuracional e por observacao passiva
de suporte, sem consultar logs pessoais. Se IP compartilhado bloquear uso
legitimo, voltar primeiro para 20/5; se necessario, restaurar 30/5.

## 18. Validacao final sem PII

### Verificacoes permitidas

- rodar novamente todos os testes locais;
- verificar por navegador carregamento dos quatro widgets nos tres hosts;
- confirmar no Dashboard apenas CAPTCHA enabled/Turnstile, minimo 12 e taxa
  10/5;
- consultar Security Advisor sem abrir Auth logs ou usuarios;
- confirmar que o alerta nativo de leaked-password protection pode permanecer
  como risco residual do Free;
- revisar Git por nomes/configuracoes sensiveis sem imprimir valores.

### Gate funcional obrigatorio do proprietario

Registrar o resultado do gate executado no passo 15; nao solicitar um segundo
e-mail apenas para repetir o mesmo teste e consumir a cota do SMTP. Depois dos
passos 16 e 17, repetir somente os logins e a verificacao visual, salvo se
codigo, Redirect URL ou CAPTCHA tiver mudado desde o recovery aprovado. Com
contas proprias ja existentes e sem enviar dados ao chat, a cobertura final e:

1. login de cliente com Turnstile;
2. login administrativo seguido por TOTP/AAL2;
3. solicitacao de recovery e recebimento do e-mail;
4. link real habilita a pagina, nova senha atende 12 caracteres e logout local
   retorna ao login;
5. confirmar visualmente que os estados de Turnstile nao deslocam ou bloqueiam
   indevidamente os formularios.

Os testes automatizados, e nao o proprietario em producao, comprovam que uma
senha sintetica marcada como exposta e recusada e que indisponibilidade
simulada do HIBP mostra aviso sem bloquear.

Nenhuma conta sera criada pela implementacao. Resultados podem ser reportados
somente como passa/falha, sem e-mail, senha, token ou conteudo da mensagem.
Se um tipo de conta autorizado nao existir, registrar a cobertura faltante e
nao declarar o release integralmente validado; recovery de uma conta propria e
obrigatorio antes de encerrar a ativacao.

## 19. Relatorio e commit pos-ativacao

Completar `docs/ATUALIZACAO-SEGURANCA-P1-AUTH-FREE-2026-07-22.md` com:

- hashes publicados;
- hosts verificados e estado passa/falha;
- configuracoes finais sem segredo;
- testes executados;
- confirmacao de zero ataque, zero conta criada, zero PII/log de Auth aberto e
  zero secret copiado;
- risco residual do HIBP no cliente, alerta nativo do Free e dependencia de
  Cloudflare/HIBP;
- rollback operacional.

Reexecutar suite e `git diff --check`, revisar o relatorio e criar commit
isolado. Nao fazer push desse relatorio sem nova autorizacao explicita.

## Stop conditions e rollback

### Antes da ativacao remota

- teste, revisao ou busca sensivel falhou: nao publicar;
- Site Key incerta ou widget falha em qualquer host: manter CAPTCHA desligado
  e remover a Site Key da versao publicada;
- CSP bloqueia Cloudflare/HIBP/Supabase: corrigir e republicar antes de ativar;
- Secret Key aparece fora do Dashboard: rotacionar antes de continuar.

### Depois da ativacao remota

1. Desabilitar CAPTCHA primeiro se cadastro, login ou recovery legitimo falhar.
2. Reverter o frontend para a versao compativel anterior ou publicar Site Key
   vazia conforme a causa.
3. Se o unico problema for IP compartilhado, elevar rate limit para 20/5;
   restaurar 30/5 se 20/5 ainda causar impacto.
4. Manter minimo 12, salvo evidencia concreta de incompatibilidade remota.
5. Rotacionar a Secret Key se houver qualquer suspeita de exposicao.
6. Nao apagar contas, redefinir senhas em massa nem abrir dados para diagnostico.

## Ordem obrigatoria

1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 ->
14 -> 15 -> 16 -> 17 -> 18 -> 19.

Nenhuma configuracao remota pode ser antecipada para compensar falha de teste,
deploy, hostname ou revisao. O primeiro ponto que exige colaboracao do usuario
e o gate da Site Key publica; a Secret Key sera sempre digitada apenas pelo
usuario no Dashboard.

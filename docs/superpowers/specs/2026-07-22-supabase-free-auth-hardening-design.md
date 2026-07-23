# Endurecimento de autenticacao no Supabase Free

Data: 22 de julho de 2026

Status: desenho aprovado para registro; implementacao depende da aprovacao desta
especificacao escrita.

## Objetivo

Reduzir abuso automatizado, credential stuffing e a escolha de senhas ja
expostas sem contratar o plano Pro do Supabase, preservando os fluxos atuais de
cadastro, login, login administrativo e recuperacao de senha da Druza.

A implementacao nao consultara nem abrira registros remotos de usuarios,
senhas, e-mails, telefones, pedidos ou outros dados pessoais. No uso normal, o
navegador continuara processando transitoriamente os dados digitados pelo
proprio usuario para envia-los ao Supabase. Nenhuma senha sera registrada em
log, tabela, arquivo ou telemetria. A Secret Key do Cloudflare Turnstile sera
configurada somente no Dashboard do Supabase e nunca sera enviada ao chat nem
adicionada ao repositorio.

## Estado confirmado

- O site e HTML, CSS e JavaScript estatico, sem etapa de build.
- O navegador usa `@supabase/supabase-js@2.45.0` com SRI.
- Cadastro e login usam e-mail e senha; nao ha login passwordless, passkey ou
  OAuth.
- O cadastro ja aceita `captchaToken`, mas a Site Key versionada esta vazia e
  nenhuma outra tela de autenticacao usa CAPTCHA.
- A politica local exige hoje 8 a 72 caracteres, minuscula, maiuscula, numero,
  simbolo e ausencia de espacos. No cadastro ela tambem rejeita parte do e-mail
  e os ultimos digitos do telefone.
- O Supabase remoto exige confirmacao de e-mail, Secure Email Change, Secure
  Password Change e senha atual; TOTP esta habilitado e as rotas administrativas
  exigem AAL2.
- O minimo remoto ainda e 8 caracteres e a protecao nativa contra senhas
  vazadas nao esta disponivel para a organizacao Free.
- O limite remoto combinado de cadastro e login esta em 30 requisicoes por
  cinco minutos por IP.
- O provedor SMTP embutido esta limitado a dois e-mails por hora; nao ha SMTP
  proprio configurado.
- A redefinicao atual considera `SIGNED_IN` comum como recuperacao, permite o
  submit antes de confirmar um evento de recovery e mantem a sessao ativa apos
  trocar a senha.

## Decisoes de arquitetura

### Permanecer com e-mail e senha

O login atual sera preservado. Passwordless nao sera adotado nesta entrega
porque dependeria fortemente de e-mail e o SMTP embutido possui uma cota muito
baixa. Passkeys tambem ficam fora: o recurso continua experimental e exige uma
versao do SDK posterior a usada pelo site. Atualizar autenticacao, CDN e SRI ao
mesmo tempo aumentaria o risco de regressao sem ser necessario para este P1.

Nao sera criada Edge Function que receba senhas. Um gateway proprio ampliaria o
limite de confianca, criaria um novo ponto para manipulacao de credenciais e
ainda precisaria impedir chamadas diretas aos endpoints publicos do Auth.

### Politica de senha

O minimo passara de 8 para 12 caracteres no navegador e no Dashboard do
Supabase. Permanecem o maximo local de 72 caracteres, as quatro classes de
caracteres, a proibicao de espacos e, durante o cadastro, a rejeicao de partes
do e-mail e telefone.

A mudanca nao invalida senhas existentes. O Supabase documenta que o login
continua permitido e o SDK 2.45.0 devolve o aviso em `data.weakPassword`, com
`error: null`, quando a senha antiga nao atende a nova politica. O wrapper
preservara a sessao valida e o redirecionamento atual; esta entrega nao forcara
troca nem exibira bloqueio para essa senha legada. A exigencia de 12 caracteres
vale para novo cadastro e nova senha em recuperacao. Mensagens de erro locais e
o mapeamento de erros remotos passarao a citar 12 caracteres.

### Modulo compartilhado de seguranca do Auth

Sera criado `js/auth-security.js`, carregado depois de `js/config.public.js` e
antes dos scripts inline das paginas de autenticacao. Ele nao tera acesso a
`service_role`, Secret Key ou dados de perfil e exportara apenas
`window.DruzaAuthSecurity`.

O modulo tera dois componentes independentes:

1. um controlador reutilizavel de Cloudflare Turnstile;
2. uma verificacao de senha exposta pelo Pwned Passwords do Have I Been Pwned.

O controlador Turnstile carregara o script oficial uma unica vez, mesmo quando
for inicializado mais de uma vez, e renderizara o widget explicitamente em modo
Managed. Cada formulario recebera seu proprio controlador, com operacoes para
obter o token atual, saber se a verificacao esta pronta e reiniciar o desafio.
Token expirado, erro do widget ou tentativa concluida invalidara o token local.

Se `TURNSTILE_SITE_KEY` estiver vazia enquanto a protecao remota ainda estiver
desativada, o controlador ficara inativo e o fluxo continuara funcionando como
hoje. Se a Site Key estiver configurada, o formulario exigira um token antes de
enviar a requisicao. Falha de carregamento nao sera silenciosa: a tela exibira
uma mensagem de tentativa novamente/recarregamento e mantera o botao
disponivel para uma nova tentativa depois que o widget estiver pronto.

### Integracao com `js/auth.js`

As assinaturas publicas serao ampliadas sem remover os parametros atuais:

- `signUp(...)` continuara recebendo `captchaToken` e o enviara em
  `options.captchaToken`;
- `signIn({ email, password, captchaToken })` enviara o token nas opcoes de
  `signInWithPassword`;
- `requestPasswordReset(email, captchaToken)` enviara o token nas opcoes de
  `resetPasswordForEmail` junto de `redirectTo`;
- `signOut(options)` encaminhara opcoes ao SDK; chamadas atuais sem argumento
  preservarao o logout global, enquanto recovery usara `{ scope: 'local' }`.

`signIn` ja recebe um objeto no codigo atual; `captchaToken` sera apenas uma
nova propriedade opcional. Todos os call sites versionados serao atualizados e
buscados estaticamente, sem introduzir uma assinatura posicional alternativa.

Ausencia de token permanecera tecnicamente aceita pelo codigo durante a fase de
publicacao anterior a ativacao remota. Depois que CAPTCHA for habilitado no
Supabase, o servidor se tornara o ponto de enforcement e recusara chamadas de
cadastro, login e recovery sem token valido.

Erros de CAPTCHA serao mapeados para uma mensagem neutra, sem revelar se o
e-mail existe ou se a senha estava correta. O desafio sera reiniciado apos cada
requisicao aceita ou recusada, pois tokens Turnstile sao temporarios e de uso
unico.

## Fluxos

### Cadastro de cliente

1. O navegador valida nome, e-mail, telefone, idade, aceite e politica de
   senha.
2. No submit completo, a senha passa pela verificacao HIBP descrita abaixo.
3. Se a senha estiver presente no corpus, o cadastro e interrompido e o usuario
   recebe orientacao para escolher uma senha unica.
4. Se a consulta estiver indisponivel, o cadastro continua com aviso nao
   bloqueante, desde que a politica local tenha sido atendida.
5. O formulario exige token Turnstile quando a Site Key estiver configurada.
6. `signUp` envia os dados atuais, o token CAPTCHA e o redirect atual de
   confirmacao de e-mail.
7. A resposta publica permanece neutra para nao enumerar contas existentes.

### Login de cliente

1. O formulario exige e-mail, senha e, quando configurado, token Turnstile.
2. Nao havera consulta HIBP durante login. Consultar a cada digitacao ou login
   acrescentaria exposicao de prefixos sem melhorar a decisao de admissao.
3. `signInWithPassword` recebe o token CAPTCHA.
4. Erro de credencial continua generico; erro ou expiracao do desafio orienta
   nova verificacao.
5. O tratamento atual de `next` local e o redirecionamento para a conta sao
   preservados.

### Login administrativo

O formulario administrativo usara o mesmo controlador e a mesma chamada
`DruzaAuth.signIn` do login de cliente. Depois do primeiro fator, permanecem a
consulta da tabela `admins`, o enrolamento/verificacao TOTP e a exigencia AAL2
nas Edge Functions. Turnstile nao substitui MFA nem autorizacao de servidor.

### Solicitacao de recuperacao

1. O formulario valida o formato do e-mail e exige Turnstile quando ativo.
2. `resetPasswordForEmail` recebe `captchaToken` e o redirect existente.
3. Se a solicitacao for aceita, a tela sempre mostra a resposta neutra "Se
   houver uma conta...".
4. Falhas de CAPTCHA, rede, configuracao ou rate limit podem orientar uma nova
   tentativa, mas nunca indicarao se o endereco esta cadastrado.

### Definicao da nova senha

`js/auth.js` registrara imediatamente um observador de Auth e conservara em
memoria apenas o fato de ter recebido `PASSWORD_RECOVERY`. Um evento
`SIGNED_IN` comum ou uma sessao previamente existente nao concedera permissao
para usar a pagina de redefinicao.

O formulario comecara desabilitado. Ele sera habilitado somente depois do
evento `PASSWORD_RECOVERY`; se isso nao ocorrer em ate 10 segundos, a pagina
mostrara que ainda nao foi possivel validar o link, permitira tentar novamente
e oferecera acesso a `recuperar-senha.html`. O observador continuara ativo para
nao rejeitar uma validacao apenas porque a rede esta lenta. Essa espera tambem
elimina a corrida atual entre a troca do token do link e o submit.

No submit, a nova senha passara pela politica de 12 caracteres e pela consulta
HIBP. Senha exposta sera recusada; indisponibilidade do HIBP gerara aviso e
permitira a continuidade. Depois de `updateUser({ password })` concluir, a
sessao de recuperacao sera encerrada com `signOut({ scope: 'local' })` antes do
redirecionamento para `login.html`. O escopo local evita desconectar outros
dispositivos sem uma decisao explicita do usuario e garante que a pagina de
login atual nao pule diretamente para a conta.

## Verificacao de senha exposta com HIBP

A verificacao usara somente o endpoint gratuito Pwned Passwords. No navegador:

1. a senha completa sera codificada em UTF-8 e resumida localmente com SHA-1
   por `crypto.subtle.digest`;
2. somente os primeiros cinco caracteres hexadecimais do hash serao enviados
   por HTTPS para `https://api.pwnedpasswords.com/range/{prefixo}`;
3. a requisicao usara `Add-Padding: true` para reduzir inferencia pelo tamanho
   da resposta, `cache: 'no-store'` e `referrerPolicy: 'no-referrer'`;
4. o navegador comparara localmente o sufixo restante e considerara exposta
   somente uma correspondencia com contagem maior que zero;
5. a resposta sera descartada em memoria, sem cache da aplicacao, persistencia,
   log ou telemetria.

SHA-1 sera usado exclusivamente porque esse e o protocolo de busca por faixa do
HIBP; ele nao sera usado para armazenar ou autenticar senhas. A senha em texto
nao sera enviada ao HIBP, e nenhum e-mail, telefone, nome ou identificador de
usuario sera consultado. A senha continuara sendo enviada diretamente ao
Supabase Auth por HTTPS, como exige o fluxo de autenticacao atual.

A consulta ocorrera uma vez por submit completo, nunca a cada tecla. Ela tera
timeout de cinco segundos. Ausencia de `crypto.subtle`, resposta sem HTTP 200,
timeout, CORS, falha de rede ou formato inesperado produzira estado
`unavailable`: o usuario vera um aviso, mas o fluxo continuara. Uma
correspondencia confirmada produzira estado `pwned` e bloqueara somente a
criacao/definicao daquela senha.

Esse controle e uma mitigacao de UX, nao uma fronteira de autorizacao. No plano
Free, um cliente pode contornar o JavaScript e chamar o Auth diretamente. Por
isso o aviso do Security Advisor sobre leaked-password protection permanecera
como risco residual documentado.

## Privacidade e servicos externos

Turnstile exige comunicacao direta do navegador com a Cloudflare, que recebe os
sinais tecnicos necessarios para executar o desafio, incluindo metadados de
rede e navegador. O token resultante sera encaminhado ao Supabase somente para
validacao e nao sera persistido ou registrado pela aplicacao.

O HIBP recebera o prefixo de cinco caracteres do SHA-1 e os metadados normais
de uma requisicao HTTPS; nao recebera senha completa, hash completo, e-mail,
telefone, nome ou ID de usuario. A aplicacao nao fara buscas de contas ou
breaches por e-mail.

`privacidade.html` recebera uma descricao curta desses dois servicos externos,
da finalidade antifraude e dos dados tecnicos enviados.
A redacao sera factual e nao afirmara certificacao ou conformidade juridica que
nao tenha sido verificada.

## Turnstile nas paginas

O mesmo bloco visual e a mesma logica compartilhada serao adicionados a:

- `cadastro.html`;
- `login.html`;
- `admin-login.html`;
- `recuperar-senha.html`.

O codigo Turnstile atualmente embutido em `cadastro.html` sera removido em favor
do controlador compartilhado. Cada tela tera uma area de verificacao, uma
mensagem com `aria-live` e comportamento consistente para carregamento,
expiracao e erro. O widget permanecera oculto somente quando nao houver Site
Key configurada.

`redefinir-senha.html` nao recebera widget: a protecao CAPTCHA se aplica a
solicitacao que envia o e-mail; a troca efetiva depende do link de recuperacao
e da sessao temporaria validada pelo Supabase.

## Configuracao remota e ordem de ativacao

A ativacao sera feita nesta ordem para evitar indisponibilidade:

1. implementar o modulo compartilhado, os quatro formularios, a politica de 12
   caracteres, a checagem HIBP e a correcao do recovery;
2. executar validacoes locais em `http://localhost:5510`, nunca por `file://`,
   com a protecao CAPTCHA remota ainda desabilitada; o controlador sera
   simulado nos testes e a Site Key de producao sera validada somente nos hosts
   publicados autorizados;
3. adicionar somente a Site Key publica atual em `js/config.public.js` na
   versao candidata, mantendo a protecao remota desabilitada;
4. publicar o frontend compativel com Turnstile e confirmar que os quatro
   widgets carregam em `druza.com.br`, `www.druza.com.br` e
   `brunocarreirocs.github.io`;
5. inserir a Secret Key rotacionada diretamente em Authentication > Bot and
   Abuse Protection no Dashboard do Supabase, escolher Cloudflare Turnstile e
   habilitar CAPTCHA;
6. alterar o minimo remoto de senha para 12, mantendo as classes fortes atuais;
7. reduzir a taxa sustentada configurada para cadastro e login para 10
   requisicoes por cinco minutos por IP, reconhecendo que o token bucket do
   Supabase pode permitir bursts curtos ate a capacidade do bucket;
8. validar os casos positivos e negativos depois da ativacao.

O passo 5 nunca sera executado antes dos passos 3 e 4. A Site Key e publica e
pode ser versionada; a Secret Key e secreta e nunca sera copiada para
`config.public.js`, Git, documentacao, logs ou chat. Se uma Secret Key voltar a
aparecer fora do Dashboard, ela devera ser rotacionada antes da ativacao.

Os controles remotos ja ativos serao preservados: confirmacao de e-mail,
Secure Email Change, Secure Password Change/sessao recente, exigencia de senha
atual e TOTP/AAL2 administrativo.

O site nao possui CSP ativa hoje. Se uma CSP for adicionada antes ou durante a
publicacao, ela devera permitir `script-src` e `frame-src` para
`https://challenges.cloudflare.com` e `connect-src` para esse origin, para
`https://api.pwnedpasswords.com` e para o Supabase ja usado pelo site.

## Comportamento de erro e usabilidade

- Botoes serao desabilitados apenas durante uma operacao em andamento e
  reabilitados em falha recuperavel.
- Widget expirado ou usado sera reiniciado; o usuario nao precisara recarregar
  a pagina em condicoes normais.
- Falha de carregamento do Turnstile mostrara instrucao clara de tentar de novo
  ou recarregar, sem enviar credenciais repetidamente.
- Respostas de login e recovery permanecerao resistentes a enumeracao de
  contas.
- Senha encontrada no HIBP sera rejeitada com texto generico e orientacao para
  criar uma senha unica; a contagem de ocorrencias nao sera exibida.
- Indisponibilidade do HIBP nao bloqueara cadastro nem recuperacao.
- O novo minimo nao bloqueara login valido com senha antiga.
- A taxa sustentada configurada de 10/5 minutos sera monitorada, considerando
  os bursts do token bucket. Se bloquear uso legitimo em IP compartilhado, o
  rollback operacional sera 20/5 minutos, sem desligar Turnstile.

## Verificacao e criterios de aceite

### Verificacao estatica e automatizada

1. `node --check` deve passar para `js/auth.js` e `js/auth-security.js`.
2. Testes com `node:test`, sem dependencia externa, cobrirao conversao SHA-1,
   separacao prefixo/sufixo, resposta segura, resposta exposta, linhas de
   padding com contagem zero, timeout e resposta malformada.
3. Busca estatica confirmara que a Secret Key, senhas e tokens CAPTCHA nao sao
   gravados nem logados.
4. As quatro paginas devem carregar `js/auth-security.js` e passar o token ao
   metodo correto; `redefinir-senha.html` deve aceitar apenas
   `PASSWORD_RECOVERY`.
5. `privacidade.html` deve identificar Turnstile e HIBP, suas
   finalidades e as categorias tecnicas enviadas, sem copiar segredos.
6. O SDK 2.45.0 e o SRI atual permanecerao inalterados nesta entrega.

### Matriz funcional sem dados pessoais

- Site Key vazia e CAPTCHA remoto desligado: os fluxos continuam com o
  comportamento anterior.
- Site Key configurada: os quatro widgets carregam nos tres hosts autorizados,
  sem erros de console ou layout.
- Token ausente, expirado ou invalido depois da ativacao: cadastro, login e
  recovery sao recusados com opcao de nova tentativa.
- Token valido: cada requisicao chega ao Supabase e o widget e reiniciado.
- Login incorreto continua sem distinguir conta inexistente de senha errada.
- Login valido com senha legada abaixo de 12 caracteres continua criando
  sessao; `data.weakPassword` nao e transformado em erro quando `error` for
  nulo.
- Recovery continua mostrando mensagem neutra para endereco nao confirmado.
- Senha de 11 caracteres e recusada; senha de 12 ou mais que atende as classes
  segue o fluxo.
- Sufixo HIBP simulado como presente bloqueia cadastro e nova senha; HIBP
  simulado indisponivel mostra aviso e permite continuar.
- Acesso direto a `redefinir-senha.html` com sessao comum mantem o formulario
  bloqueado.
- Link real de recovery habilita o formulario; apos sucesso, a sessao e
  encerrada e `login.html` permanece visivel.
- O mesmo recovery funciona com Secure Password Change e exigencia de senha
  atual mantidas nas configuracoes remotas atuais.
- Admin continua exigindo TOTP/AAL2 depois do login com Turnstile.
- Security Advisor e telas de configuracao serao consultados sem abrir Auth
  logs, registros de usuarios ou conteudo pessoal.

Nenhuma conta sera criada ou aberta durante a implementacao. O teste positivo
que depende de receber e-mail sera entregue como roteiro para o proprietario
executar com a propria conta, sem compartilhar e-mail, senha, token ou conteudo
da mensagem.

## Rollback

Se houver regressao antes da ativacao remota, os arquivos do frontend podem
voltar ao commit anterior sem efeito no Auth. Depois da ativacao, a ordem de
rollback sera:

1. desabilitar CAPTCHA no Dashboard para restaurar imediatamente cadastro,
   login e recovery;
2. restaurar o frontend anterior;
3. elevar a taxa sustentada de cadastro/login de 10/5 para 20/5 se o unico
   problema for IP compartilhado;
4. manter o minimo de 12 caracteres, salvo evidencia concreta de
   incompatibilidade;
5. rotacionar a Secret Key se o incidente envolver credenciais do Turnstile.

Desabilitar CAPTCHA e temporario; a causa devera ser corrigida e a protecao
reativada. O rollback nao exige apagar contas, redefinir senhas existentes ou
acessar dados de usuarios.

## Riscos residuais aceitos

- A protecao nativa do Supabase contra senhas vazadas continuara indisponivel e
  o Advisor podera manter o alerta.
- A verificacao HIBP no cliente pode ser contornada por quem chamar a API do
  Auth diretamente.
- Senhas existentes nao serao reavaliadas e continuarao validas no login.
- Fail-open do HIBP preserva disponibilidade, mas permite nova senha sem essa
  verificacao durante falha externa.
- Turnstile reduz automacao, mas nao substitui senha unica, MFA administrativo,
  rate limit, confirmacao de e-mail ou RLS.
- A cota de dois e-mails por hora do SMTP embutido continua sendo uma limitacao
  operacional separada desta entrega.
- Cloudflare e HIBP permanecem dependencias externas de disponibilidade e
  privacidade para os controles adicionais descritos.

## Fora de escopo

- contratar Supabase Pro;
- habilitar o controle nativo de leaked passwords indisponivel no Free;
- migrar para magic link, OTP, passkeys, OAuth ou SMTP proprio;
- atualizar o SDK do Supabase;
- criar gateway/Edge Function que receba senha;
- forcar redefinicao em massa ou inspecionar credenciais existentes;
- alterar RLS, tabelas, pagamentos, catalogo ou permissoes administrativas.

## Referencias oficiais verificadas

- [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase signOut](https://supabase.com/docs/reference/javascript/auth-signout)
- [Supabase Passkeys](https://supabase.com/docs/guides/auth/passkeys)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/)
- [Cloudflare Hostname Management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
- [HIBP Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords)

# Atualização de segurança P1 — Auth no Supabase Free

- Data: 22/07/2026
- Projeto autorizado: `hqkpgghlbwincahfwkem`
- Estado: implementação local validada; ativação remota ainda bloqueada pelos
  gates de release.

## Checklist concluído localmente

- [x] Política local de novas senhas elevada de 8 para 12 caracteres, mantendo
  login de senhas legadas.
- [x] Consulta ao Pwned Passwords somente no cadastro e na redefinição, uma vez
  por submit completo, usando k-anonymity com prefixo SHA-1 de cinco caracteres,
  `Add-Padding`, `no-store`, `no-referrer` e timeout de cinco segundos.
- [x] Senha, hash completo, prefixo, sufixo, contagem remota e resposta HIBP não
  são registrados nem persistidos pela aplicação.
- [x] Falha do HIBP é fail-open com aviso não bloqueante em região dedicada;
  correspondência positiva bloqueia aquela nova senha.
- [x] Controlador Turnstile compartilhado nos quatro pontos públicos de Auth:
  cadastro, login, login administrativo e solicitação de recovery.
- [x] Site Key vazia mantém os formulários utilizáveis enquanto o CAPTCHA remoto
  continua desligado.
- [x] Token Turnstile permanece apenas em memória e é invalidado em uso,
  expiração, erro e reset.
- [x] Retry do loader é recuperável e não reaproveita promise rejeitada.
- [x] Loader Turnstile tem timeout de oito segundos; erro e expiração exibem
  uma ação de retry, e o widget alterna entre largura flexível e compacta
  conforme o espaço disponível.
- [x] Recovery libera a nova senha exclusivamente após `PASSWORD_RECOVERY`;
  sessão comum não autoriza o formulário.
- [x] Depois da troca de senha, o fluxo executa logout local antes do redirect.
- [x] Duplo submit é bloqueado nos formulários de entrada e durante HIBP,
  atualização de senha e logout.
- [x] Respostas públicas de cadastro, login e recovery foram neutralizadas para
  reduzir enumeração de contas; recovery mantém a mesma resposta até para erro
  remoto, rate limit ou falha de rede.
- [x] Política de privacidade informa Cloudflare Turnstile e Pwned Passwords.

## Evidências locais

- `node --check js/auth-security.js`: passou.
- `node --check js/auth.js`: passou.
- Suíte Node sem rede: **43/43 testes passaram**.
- Preview em `http://localhost:5510`, sem preencher ou submeter credenciais:
  - quatro wrappers Turnstile ocultos com Site Key vazia;
  - quatro formulários de entrada permaneceram utilizáveis;
  - redefinição iniciou bloqueada e exibiu o fallback após dez segundos;
  - nenhuma falha de JavaScript foi observada;
  - cadastro e recovery foram inspecionados em desktop e emulação móvel.

## Baseline remoto somente leitura

- Plano Supabase Free confirmado.
- CAPTCHA remoto: desligado.
- Mínimo remoto: 8 caracteres.
- Classes fortes: maiúscula, minúscula, número e símbolo já habilitadas.
- Cadastro/login: 30 requisições por cinco minutos por IP.
- Proteção nativa contra senhas vazadas: indisponível no Free.
- Site URL atual: `http://localhost:5002`.
- Redirect URLs atuais: somente as duas rotas locais em `localhost:5002`.

Nenhuma configuração remota foi alterada nesta fase.

## Divergência de publicação encontrada

- O app está publicado em
  `https://brunocarreirocs.github.io/Druza_semi_joias_site/`.
- Em 22/07/2026, `druza.com.br/login.html` e a rota em `www` apontavam para
  outro site/GoDaddy e retornavam página não encontrada.
- DNS, hospedagem e conteúdo do domínio customizado não foram alterados.
- Até a migração do domínio, o Site URL e as Redirect URLs do app devem usar
  somente o origin e o path exatos do GitHub Pages.

## Gates pendentes por prioridade

### P1 — antes de publicar

- [ ] Confirmar somente a **Site Key pública atual** do widget rotacionado.
- [ ] Manter a Secret Key exclusivamente no campo do Dashboard; ela não pode ser
  lida, copiada, enviada ao chat, versionada ou capturada em screenshot.
- [ ] Criar o commit pré-deploy isolado e revisar seus arquivos.
- [ ] Obter autorização explícita antes de qualquer push, pois a branch já tem
  commits locais anteriores ainda não publicados.

### P1 — publicação compatível

- [ ] Corrigir o Site URL para o GitHub Pages enquanto esse for o único host do
  app e substituir as URLs locais pelos dois redirects publicados exatos.
- [ ] Publicar o frontend com Site Key e CAPTCHA remoto ainda desligado.
- [ ] Verificar visualmente os quatro widgets no GitHub Pages, sem credenciais.
- [ ] Não adicionar os origins `druza.com.br`/`www` até o app e as rotas de Auth
  estarem realmente publicados nesses hosts.

### P1 — ativação remota

- [ ] O proprietário cola a Secret Key diretamente no Dashboard e confirma que
  salvou; a automação verifica apenas provedor e estado habilitado.
- [ ] O proprietário executa, com conta própria e sem compartilhar dados, login,
  login administrativo + TOTP e um recovery real completo.
- [ ] Somente após o gate positivo, elevar o mínimo remoto para 12.
- [ ] Depois da estabilidade, reduzir apenas cadastro/login de 30/5 para 10/5.
- [ ] Confirmar estado final sem abrir usuários, perfis ou Auth logs.

## Riscos residuais aceitos

- A checagem HIBP no cliente é contornável por quem não usa o frontend oficial;
  ela não equivale ao recurso nativo pago do Supabase.
- O Advisor pode continuar alertando sobre leaked-password protection no plano
  Free.
- Cadastro e recovery passam a depender da disponibilidade de Cloudflare e, de
  forma fail-open limitada, do HIBP.
- O SMTP embutido continua sujeito à cota do plano Free.

## Rollback

1. Se um fluxo legítimo falhar após ativar CAPTCHA, desabilitar CAPTCHA primeiro.
2. Se o widget falhar, publicar `TURNSTILE_SITE_KEY` vazia e manter CAPTCHA remoto
   desligado até corrigir.
3. Se o limite por IP afetar uso legítimo, restaurar primeiro 20/5 e, se
   necessário, 30/5.
4. Se houver suspeita de exposição da Secret Key, rotacioná-la antes de retomar.

## Confirmações de escopo

- Zero ataque ou brute force.
- Zero conta criada pela implementação.
- Zero Auth log, lista de usuários ou dado pessoal aberto.
- Zero Secret Key lida, copiada ou armazenada.
- Zero push realizado até este ponto.

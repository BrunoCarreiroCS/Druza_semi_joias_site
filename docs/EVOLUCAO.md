# Evolução do Projeto — Druza Semi Joias

Linha do tempo de como o site saiu de protótipo estático para loja funcional
com pagamento real, painel administrativo seguro e infraestrutura de
produção. Serve como registro histórico — pra entender "como chegamos aqui"
sem precisar reler a conversa inteira.

---

## Fase 0 — Protótipo (antes deste histórico)

Site estático HTML/CSS/JS, design editorial pronto, catálogo local em
`js/catalog.js`, carrinho/checkout **simulados** em `localStorage` (sem
backend, sem pagamento real).

## Fase 1 — Backend real + pagamento (MercadoPago)

- Supabase configurado: `profiles`, `addresses`, `orders`, `order_items` com
  RLS em tudo.
- Auth completo: cadastro, login, recuperação de senha.
- Edge Function `create-preference`: cria pedido e preferência do
  MercadoPago, **recalculando preços no servidor** (nunca confia no navegador).
- Edge Function `webhook-mp`: confirma pagamento.
- **Problema descoberto e resolvido**: o HMAC da assinatura do webhook nunca
  batia pra pagamentos reais (inconsistência do próprio ambiente do MP —
  investigação exaustiva documentada, não era erro nosso). Solução final:
  **re-consultar o pagamento diretamente na API do MP** com nosso Access
  Token + **conferir o valor pago** antes de marcar "pago" — uma âncora de
  confiança mais forte que a assinatura, que segue quebrada.
- Checkout validado **ponta a ponta** com pagamento de teste real via ngrok.

## Fase 2 — CRUD de endereços

`conta.html` ganhou criar/editar/excluir endereço e marcar padrão, direto via
RLS (sem Edge Function nova — a política já permitia).

## Fase 3 — Painel administrativo seguro

Pedido do dono: uma tela de admin dentro do próprio site, com segurança forte
contra invasão.

- Modelo de segurança definido em plan mode antes de codar: tabela `admins`
  **sem nenhuma política de escrita** (promoção só manual, via SQL Editor —
  fecha auto-promoção), autorização centralizada num módulo compartilhado
  (`_shared/require-admin.ts`) usado por toda Edge Function admin, log de
  auditoria de toda ação.
- Aba **Pedidos**: listar/filtrar/buscar, mudar status, rastreio, detalhe
  logístico completo (cliente, endereço, forma de pagamento real consultada
  no MP).
- Aba **Produtos**: preço/estoque/ativo/destaque — vira a **fonte única de
  verdade** também usada pelo checkout (corrigiu um bug real: o catálogo do
  checkout só tinha 3 dos 7 produtos).
- Catálogo do site passou a buscar preço/estoque **ao vivo** do banco
  (`js/catalog.js`), com fallback estático instantâneo — preço exibido nunca
  mais diverge do cobrado.
- Produto novo criado pelo painel ganhou página própria automática
  (`produto.html?slug=...`) e entrou no `catalogo.html` (todas as peças).

## Fase 4 — 2FA obrigatório no admin

Pedido do dono: usuário + senha não bastava, precisava de token que só ele
gera.

- **2FA TOTP nativo do Supabase** (Google Authenticator/Authy) — não cripto
  própria.
- **A trava real ficou no servidor**: `require-admin.ts` passou a exigir o
  claim `aal2` do JWT (2FA verificado na sessão). Sem isso, toda Edge
  Function admin devolve 403 — adulterar a tela não adianta nada.
- Tela de login dedicada (`admin-login.html`, separada da de clientes) com
  fluxo de ativação obrigatória do 2FA no primeiro acesso (QR + código
  manual).
- **Bug real encontrado e corrigido**: o QR gerado pelo Supabase (uma "data
  URI" com aspas duplas dentro) quebrava o HTML ao ser inserido via string —
  corrigido setando `.src` como propriedade do elemento, não por
  concatenação de string.

## Fase 5 — Revisão de segurança + organização geral

Pedido do dono: revisar o projeto inteiro, endurecer segurança, organizar
pastas.

- **Rate limiting** por IP em todas as 7 Edge Functions do navegador.
- **CORS restringível** por variável de ambiente (`ALLOWED_ORIGIN`).
- **Validação de entrada** (slugs com formato estrito, limites de tamanho,
  teto de preço) nas funções que faltavam.
- **XSS corrigido**: um ponto real onde nome/imagem de produto (editável pelo
  painel) ia pro HTML sem escape.
- **supabase-js pinado com SRI** (hash de integridade) em vez de versão
  flutuante.
- **Fontes auto-hospedadas** (12 arquivos woff2) — zero requisição ao Google
  Fonts. Descoberta lateral: 5 páginas de conteúdo nem carregavam a fonte da
  marca antes.
- **Imagens WebP** (3 fotos, ~63% menores).
- `robots.txt` + `sitemap.xml` (sem citar o admin, de propósito).
- **Reorganização**: todos os guias `.md` movidos pra `docs/` (com
  `git mv`, preservando histórico); `README.md` reescrito refletindo o
  e-commerce real; novo `docs/SEGURANCA.md` (mapa de camadas + checklist de
  produção + resposta a incidentes).

## Fase 6 — Backlog de logística + implementação do primeiro pacote

- `docs/IDEIAS-ADMIN-LOGISTICA.md`: 20 ideias priorizadas (rastreio, e-mail,
  etiqueta, timeline, estoque numérico, cupons, dashboard, etc.), cada uma
  com contexto técnico e modelo sugerido — pra outro agente executar sem
  depender da conversa.
- Prompt pronto (`docs/PROMPT-PROXIMA-ETAPA.md`) pro pacote de maior
  valor/esforço.
- **Implementado** (por outro agente + revisado/corrigido nesta sessão):
  link de rastreio clicável (detecta Correios), alerta de pedido parado
  (+48h pago sem envio), filtro por período + exportar CSV, notas internas
  do pedido. 2 pequenos bugs de encoding corrigidos na revisão.
- **Adicionado na revisão**: etiqueta de envio + romaneio imprimível
  (puro front-end, sem deploy novo).

## Fase 7 — Analytics + preparação final de produção

- **GA4** (`js/analytics.js`): scaffold desativado por padrão (zero chamada
  de rede até colar o Measurement ID), incluído nas 25 páginas públicas,
  **de propósito ausente** do painel admin (minimizar terceiros na área
  restrita).
- Auditoria completa do que falta pra "ir ao ar de fato": distinção clara
  entre o que já está pronto (base técnica) e o que depende de
  decisão/ação do dono (domínio, hospedagem, credenciais de produção do MP,
  textos legais, og-image).
- `docs/GUIA-DE-PRODUCAO.md` reescrito — a versão antiga descrevia um
  protótipo simulado que não existe mais; a nova reflete o estado real e
  lista exatamente os passos pra sair do modo teste.
- Esclarecimento sobre domínio: GoDaddy é só o **registrador** (nome), não
  hospedagem — o Site Builder do pai é uma ferramenta separada, sem relação
  com este projeto. Decisão de manter ou trocar de domínio ficou em aberto,
  a depender de acesso administrativo à conta.

---

## Onde estamos agora

Loja funcional com pagamento real testado, painel administrativo com 2FA
genuinamente seguro, base técnica de produção (performance + segurança)
pronta. **Falta**: domínio resolvido, hospedagem escolhida, credenciais do
MercadoPago em modo produção, GA4 com ID real, e polimento de conteúdo
(og-image, textos legais, 404 personalizada). Nenhum desses itens exige mais
trabalho de arquitetura — são configuração e decisão de negócio.

Ver `docs/GUIA-DE-PRODUCAO.md` para o checklist acionável e
`docs/IDEIAS-ADMIN-LOGISTICA.md` para o que vem depois do lançamento.

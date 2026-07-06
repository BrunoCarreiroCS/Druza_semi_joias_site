# Ideias — Painel Admin, Produtos e Logística

Backlog de melhorias para o painel administrativo da Druza, anotado em 2026-07-05
a pedido do dono. Itens marcados com ✅ já foram implementados; os demais ficam
para outro agente (ou sessão futura) pegar uma ideia e executá-la de forma
autônoma.

## Contexto pra quem for implementar

- Stack: front estático HTML/CSS/JS puro + Supabase (Postgres/Auth/Edge
  Functions Deno) + MercadoPago. Sem frameworks, sem build.
- Painel: `admin.html` (abas Pedidos/Produtos) + `js/admin.js` (camada
  `window.DruzaAdmin`) + `css/admin.css`. Login com 2FA em `admin-login.html`.
- **Toda ação sensível passa por Edge Function** (`supabase/functions/admin-*`)
  que valida admin + `aal2` via `_shared/require-admin.ts` e grava
  `admin_audit_log`. Nunca liberar escrita via RLS direto pro client — seguir
  esse padrão em qualquer feature nova (ver `docs/SEGURANCA.md`).
- Tabelas: `orders` (status, tracking_code, mp_payment_id…), `order_items`
  (snapshot), `products` (slug/preço/ativo/estoque bool/destaque), `admins`,
  `admin_audit_log`, `addresses`, `profiles`.
- Regra de modelo (memória do projeto): tarefa mecânica com padrão claro →
  Sonnet; arquitetura/segurança/dinheiro real → Opus.

---

## A) Logística e rastreio (maior valor pro dia a dia)

1. ✅ **Link de rastreio clicável + copiar** — feito em 2026-07-05. Detectar transportadora pelo
   formato do código (Correios: `^[A-Z]{2}\d{9}BR$`) e renderizar link direto
   (ex.: rastreamento dos Correios ou agregador tipo 17track) no detalhe do
   pedido do admin **e** na conta do cliente (`conta.html`). Botão "copiar
   código". *Baixa complexidade, só front. Sonnet.*

2z. ✅ **Analytics (GA4)** — feito em 2026-07-06. `js/analytics.js` carrega o
    gtag.js só se um Measurement ID (`G-XXXXXXXXXX`) for colado na constante
    `GA4_ID` no topo do arquivo; vazio = zero chamada de rede (verificado no
    preview). Incluído em todas as 25 páginas públicas; **de propósito não
    incluído** em `admin.html`/`admin-login.html` (minimizar terceiros na
    área restrita). Falta só o usuário criar a conta em analytics.google.com
    e colar o ID.

2. **E-mail automático ao cliente** — ao marcar **Enviado** (com rastreio),
   disparar e-mail "seu pedido foi postado" via Resend; idem confirmação ao
   virar **Pago** (gancho no `webhook-mp` ou na `admin-update-order`).
   Depende de domínio + Resend configurado. *Média. Sonnet, com revisão do
   texto pelo dono.*

3. ✅ **Romaneio / etiqueta imprimível** — feito em 2026-07-06.
   O detalhe do pedido imprime etiqueta completa com remetente configurável,
   destinatário grande, CEP destacado, romaneio/picking list e declaração de
   conteúdo pré-preenchida. A aba Pedidos também imprime em lote os pedidos
   "Pago" carregados na tela. *Sonnet.*

4. **Timestamps e linha do tempo do pedido** — colunas `paid_at`, `shipped_at`,
   `delivered_at` em `orders` (preenchidas na transição de status) + timeline
   visual no detalhe do pedido e na conta do cliente ("Pago em 01/07 →
   Enviado em 02/07…"). *Média (SQL + function + front). Sonnet.*

5. ✅ **Alerta de pedido parado** — feito em 2026-07-05. Destacar em vermelho/âmbar pedidos "Pago" há
   mais de 48h sem envio (badge "atrasado" + contador na aba). Evita esquecer
   encomenda. Depende do item 4 (paid_at). *Baixa. Sonnet.*

6. ✅ **Filtro por período + exportar CSV** — feito em 2026-07-05. Filtro de data (hoje/7 dias/mês/
   intervalo) na lista de pedidos e botão "Exportar CSV" (pra planilha/
   contabilidade). Export pode ser gerado no front a partir do JSON já
   retornado. *Baixa-média. Sonnet.*

7. **Seleção em lote com checkbox** — evoluir o "Salvar todas as alterações"
   (já existe): checkbox por linha + ação "marcar selecionados como Enviado",
   colando códigos de rastreio em sequência. *Baixa-média. Sonnet.*

8. ✅ **Notas internas do pedido** — feito em 2026-07-05. Campo `admin_notes` em `orders`, editável só
   pelo painel (ex.: "cliente pediu embalagem de presente"). Nunca exibido ao
   cliente. *Baixa. Sonnet.*

9. **Frete real (Melhor Envio ou Correios API)** — cotação de frete real no
   checkout (substituindo a tabela simulada por CEP) e, no painel, compra de
   etiqueta com um clique. É o maior salto de logística, mas envolve conta em
   gateway de frete, tokens novos e dinheiro real. *Alta. Opus para desenho,
   Sonnet para telas.*

## B) Produtos

10. **Estoque numérico** — trocar `in_stock boolean` por `stock_qty integer`:
    decrementa no `webhook-mp` quando o pedido vira pago, zera → "Esgotado"
    automático no site, alerta de estoque baixo (≤ N) no painel. Cuidado com
    concorrência (decremento atômico via SQL). *Média. Opus no desenho do
    decremento, Sonnet no resto.*

11. **CMS de fotos/descrição** — upload de imagem pelo painel (Supabase
    Storage, bucket público só-leitura; escrita via Edge Function admin),
    campos descrição/material/medidas/tamanhos no banco, e `catalog.js`
    passando a ler tudo do banco. Elimina a última dependência de editar
    código pra produto novo. *Alta. Já mapeada no roadmap (druza-next-steps).*

12. **Variações com estoque por tamanho** — tabela `product_variants`
    (produto × tamanho × estoque), seletor do site passa a refletir
    disponibilidade real por aro. Depende do item 10. *Média-alta.*

13. **Preço promocional (de/por)** — colunas `sale_price_cents` +
    `sale_until`; site mostra riscado/oferta, checkout cobra o promocional
    dentro da validade. `create-preference` precisa respeitar a mesma regra
    (fonte única de verdade). *Média. Sonnet.*

14. **Cupons gerenciáveis** — tabela `coupons` (código, % ou valor fixo,
    validade, limite de usos, ativo) + CRUD no painel + `create-preference`
    validando no banco (hoje o cupom `PRIMEIRADRUZA` é hardcoded em 3
    lugares). *Média. Sonnet.*

15. **Duplicar produto** e **ordem manual da vitrine** (campo `sort_order`,
    setinhas ↑↓ no painel). *Baixa. Sonnet.*

## C) Visão de negócio

16. **Aba "Resumo" (dashboard)** — cartões no topo do painel: vendas do dia/
    semana/mês (R$ e nº de pedidos), ticket médio, top 3 produtos, contadores
    por status (X aguardando envio). Uma Edge Function `admin-stats` com 2-3
    queries agregadas. *Média. Sonnet.*

17. **Aba "Clientes"** — lista de clientes com total gasto, nº de pedidos,
    último pedido; clicar abre os pedidos daquele cliente. Atenção LGPD: só
    admin vê, e já fica coberto pelo `require-admin`. *Média. Sonnet.*

18. **Auditoria visível** — aba simples listando `admin_audit_log` (quem fez
    o quê, quando) — os dados já são gravados hoje, falta só a tela (nova
    Edge Function `admin-list-audit`, leitura). *Baixa. Sonnet.*

## D) Cliente (reflexo da logística na loja)

19. **Página "acompanhar pedido"** — na conta do cliente, timeline visual por
    pedido (status + link de rastreio clicável) em vez do badge simples de
    hoje. Combina com itens 1 e 4. *Baixa-média. Sonnet.*

20. **Aviso de troca/devolução estruturado** — botão "solicitar troca" no
    pedido entregue → cria registro que aparece no painel do admin (em vez do
    fluxo manual por WhatsApp descrito em `trocas.html`). *Média.*

---

**Sugestão de ordem de implementação** (valor ÷ esforço): 1 → 5 → 8 → 6 → 3 →
4 → 16 → 10 → 14 → 2 → 19 → resto. Os itens 1, 5, 6 e 8 juntos dão um salto
grande de logística com pouco risco.

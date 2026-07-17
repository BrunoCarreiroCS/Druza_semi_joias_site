# Guia de Produção — Druza Semi Joias

Checklist do que falta para o site sair do ambiente de teste e vender de verdade.
Complementa `README.md` (arquitetura), `docs/SEGURANCA.md` (camadas de segurança),
`docs/MERCADOPAGO-SETUP.md` (integração de pagamento) e `docs/ADMIN-GUIA.md`
(painel administrativo).

## Onde estamos hoje (real, não protótipo)

Isto **não é mais** um protótipo simulado — é uma loja funcional com backend real:

- **Checkout real** via MercadoPago (Pix/cartão/boleto), testado ponta a ponta em
  ambiente de teste: carrinho → pagamento → webhook confirma → pedido "Pago".
- **Backend real** em Supabase: contas de cliente, endereços, pedidos, RLS em
  todas as tabelas.
- **Painel administrativo** com 2FA obrigatório, gestão de pedidos (status,
  rastreio, notas internas, etiqueta imprimível, CSV, alerta de atraso) e
  produtos (preço/estoque/destaque — fonte única de verdade usada pelo checkout).
- **Segurança**: RLS, rate limiting, CORS restringível, validação de entrada,
  XSS corrigido, SRI no CDN, webhook que nunca confia na notificação (re-consulta
  a API do MP + confere valor).
- **Performance**: imagens WebP, fontes auto-hospedadas (zero Google Fonts),
  robots.txt + sitemap.xml.
- **Analytics**: scaffold do GA4 pronto (`js/analytics.js`), só falta colar o
  Measurement ID.

O que falta é **conteúdo/decisões de negócio** e **colocar no ar com domínio
próprio** — não é mais construir a base técnica.

---

## Fase 1 — Sair do ambiente de teste (obrigatório antes de vender de verdade)

🔑 = decisão/ação que só o dono consegue fazer (precisa de acesso a painéis
externos: Supabase, MercadoPago, GoDaddy/DNS, host).

1. 🔑 **Hospedar o site.** O código é estático (HTML/CSS/JS) + Edge Functions no
   Supabase — falta só um host que sirva os arquivos estáticos: **Vercel,
   Netlify ou Cloudflare Pages** (qualquer um dos três, planos gratuitos
   atendem). O GoDaddy só administra o **nome** do domínio; ele não hospeda o
   código.
2. 🔑 **Apontar o DNS** do domínio (no GoDaddy) para o host escolhido (cada um
   fornece um registro CNAME/A pra colar lá).
3. 🔑 **Trocar credenciais do MercadoPago** de teste (`TEST-...`) para produção
   (`APP_USR-...`):
   ```powershell
   supabase secrets set MP_ACCESS_TOKEN=APP_USR-sua-chave-producao
   supabase functions deploy webhook-mp --no-verify-jwt
   supabase functions deploy create-order
   supabase functions deploy process-payment
   ```
   Troque também `MP_PUBLIC_KEY` em `js/config.public.js` pela Public Key de produção.
4. 🔑 **Webhook de produção** configurado no painel do MercadoPago (mesma URL
   do Supabase, mas no ambiente "Produção" do MP — ver `docs/MERCADOPAGO-SETUP.md`).
5. 🔑 **Restringir CORS** (a URL para de mudar assim que o domínio for fixo):
   ```powershell
   supabase secrets set ALLOWED_ORIGINS=https://SEU-DOMINIO,https://www.SEU-DOMINIO
   # redeploy de todas as 8 Edge Functions depois
   ```
6. 🔑 **Supabase → Authentication → URL Configuration**: trocar "Site URL" e
   "Redirect URLs" de localhost/ngrok para o domínio real (só dá pra fazer
   pelo painel, não por código).
7. **Teste com dinheiro real**: um pagamento de valor baixo, ponta a ponta,
   confirmando que webhook/status/e-mail funcionam com credenciais reais.

**Pronto quando:** site acessível pelo domínio com HTTPS, e um pagamento real
de teste (valor baixo) completa o fluxo até "Pago".

## Fase 2 — Conteúdo e polimento (não bloqueia vender, mas vale fazer)

- 🔑 **GA4**: criar conta em analytics.google.com, colar o Measurement ID em
  `js/analytics.js` (`GA4_ID = '...'`).
- **og-image dedicada** (1200×630): hoje o link compartilhado usa uma foto de
  produto como prévia — funciona, mas uma arte pensada pra isso fica melhor.
- 🔑 **Revisão jurídica dos textos legais** (privacidade, trocas/devolução,
  garantia) — hoje são textos-modelo razoáveis, mas vale confirmação jurídica
  antes de valerem oficialmente.
- **Página 404 personalizada** — hoje um link quebrado cai na página padrão do
  host escolhido.
- **Fotos e descrição de produtos novos**: o catálogo dinâmico (painel admin)
  já cobre preço/estoque/visibilidade; fotos/descrição de produto novo ainda
  dependem de edição de código (`js/catalog.js`) — ver
  `docs/IDEIAS-ADMIN-LOGISTICA.md` item 11 pra virar CMS completo no futuro.

## Fase 3 — Crescimento (pós-lançamento, sem pressa)

Backlog completo e priorizado em `docs/IDEIAS-ADMIN-LOGISTICA.md`: e-mail
transacional automático, frete real (Correios/Melhor Envio), estoque
numérico, cupons gerenciáveis pelo painel, dashboard de vendas, variações por
tamanho, CMS de fotos, entre outros.

---

## ✅ Checklist "pronto para vender de verdade"

- [ ] Site no ar no domínio próprio, com HTTPS
- [ ] Credenciais do MercadoPago em modo produção
- [ ] Webhook de produção configurado no MP
- [ ] `ALLOWED_ORIGIN` restrito ao domínio final
- [ ] Redirect URLs do Supabase Auth atualizadas
- [ ] Pagamento real de teste (valor baixo) completou o fluxo
- [ ] GA4 com Measurement ID configurado
- [ ] Textos legais revisados juridicamente

## 🔑 Decisões pendentes do dono

| Tema | O que falta |
|---|---|
| Domínio | Definir domínio final e ter acesso à conta que o administra |
| Hospedagem | Escolher host estático (Vercel/Netlify/Cloudflare Pages) |
| MercadoPago | Ativar credenciais de produção na conta da loja |
| Textos legais | Revisão jurídica de privacidade/trocas/garantia |
| Analytics | Criar conta GA4 e obter o Measurement ID |

---

### Documentos relacionados
- `README.md` — arquitetura e estrutura de arquivos.
- `docs/SEGURANCA.md` — camadas de segurança e checklist de deploy detalhado.
- `docs/MERCADOPAGO-SETUP.md` — passo a passo completo da integração de pagamento.
- `docs/ADMIN-GUIA.md` — como usar o painel administrativo.
- `docs/IDEIAS-ADMIN-LOGISTICA.md` — backlog priorizado de melhorias futuras.

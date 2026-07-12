# Guia do Painel Administrativo — Druza Semi Joias

Guia prático de como **acessar, usar e manter** a área administrativa do site.
Feito para o dono da loja — não precisa saber programar para seguir.

> **Resumo rápido:** o admin fica em `admin-login.html`, exige e-mail + senha + um
> código de 6 dígitos (2FA) do seu celular, e serve para gerenciar **pedidos** e
> **produtos**. Ninguém entra sem os três: estar cadastrado como admin, saber a
> senha, e ter o seu celular com o app autenticador.

---

## Índice

1. [O que dá para fazer](#1-o-que-dá-para-fazer)
2. [Como funciona a segurança](#2-como-funciona-a-segurança)
3. [Configuração inicial (uma vez só)](#3-configuração-inicial-uma-vez-só)
4. [Primeiro acesso: ativar o 2FA](#4-primeiro-acesso-ativar-o-2fa)
5. [Como acessar no dia a dia](#5-como-acessar-no-dia-a-dia)
6. [Como usar: Pedidos](#6-como-usar-pedidos)
7. [Como usar: Produtos](#7-como-usar-produtos)
8. [Preço e catálogo: como o site fica sincronizado](#8-preço-e-catálogo-como-o-site-fica-sincronizado)
9. [Se perder o celular (recuperação)](#9-se-perder-o-celular-recuperação)
10. [Futuros upgrades](#10-futuros-upgrades)

---

## 1. O que dá para fazer

**Pedidos**
- Ver **todos** os pedidos de todos os clientes.
- Filtrar por status e buscar por e-mail / número do pedido.
- Abrir o **detalhe de logística** de cada pedido: nome, e-mail e telefone do
  cliente, endereço de entrega completo, itens, forma de pagamento usada
  (cartão/Pix/boleto, parcelas, status — consultado ao vivo no MercadoPago).
- Mudar o status (Aguardando → Pago → Enviado → Entregue / Cancelado) e registrar
  o **código de rastreio**.

**Produtos**
- Criar produto novo, editar preço, pausar/reativar a venda, marcar/desmarcar
  "em estoque", colocar em **destaque** na página inicial, e excluir.
- O preço que você define aqui é o **mesmo** que o site mostra e que o checkout
  cobra (ver [seção 8](#8-preço-e-catálogo-como-o-site-fica-sincronizado)).

> **O que o painel ainda NÃO faz (de propósito, por enquanto):** enviar reembolso
> real pelo MercadoPago (cancelar aqui só muda o status interno — o estorno do
> dinheiro continua no painel do MP); e subir **fotos/descrição** de produto novo
> (isso ainda é feito no código). Ver [Futuros upgrades](#10-futuros-upgrades).

---

## 2. Como funciona a segurança

São **três camadas** — faltando qualquer uma, ninguém entra:

1. **Estar na lista de admins.** Existe uma tabela `admins` no banco. Só quem está
   nela é admin. Ninguém vira admin pelo site — só você, manualmente, pelo painel
   do Supabase (ver [seção 3](#3-configuração-inicial-uma-vez-só)).
2. **Senha correta** (a senha da sua conta no site).
3. **Código do 2FA** — um código de 6 dígitos que muda a cada 30 segundos, gerado
   por um app no **seu celular** (Google Authenticator, Authy, 1Password…). Só você
   tem esse app configurado, então só você gera o código.

**O detalhe mais importante:** a trava não está só na tela — está **no servidor**.
Toda ação administrativa (listar pedido, editar produto, etc.) é revalidada pelo
servidor, que exige o 2FA verificado. Ou seja: mesmo que alguém descubra sua senha
e tente burlar o site pelo navegador, **não consegue nada** sem o código do seu
celular. É o mesmo princípio de segurança usado no pagamento: nunca confiar no
navegador, sempre reconferir no servidor.

---

## 3. Configuração inicial (uma vez só)

Estes passos são feitos **uma única vez**, no painel do Supabase e no terminal.
São ações que mexem em produção, então ficam com você (o dono).

### 3.1. Rodar o SQL

No Supabase → **SQL Editor** → cole e rode o conteúdo de `db/schema-admin.sql`.
Isso cria as tabelas `admins`, `products` (com os 7 produtos atuais) e
`admin_audit_log`, e a coluna de rastreio nos pedidos.

### 3.2. Tornar sua conta admin

Ainda no **SQL Editor**, rode (troque pelo seu e-mail de login no site):

```sql
insert into public.admins (user_id, note)
select id, 'dono da loja' from auth.users
where email = 'SEU-EMAIL@exemplo.com';
```

> Você precisa **já ter uma conta** no site (criada em `cadastro.html`) com esse
> e-mail. Se não tiver, crie primeiro.

### 3.3. Ligar o MFA (2FA) no Supabase

Supabase → **Authentication → MFA** → garanta que **TOTP** está habilitado.
(Costuma vir ligado; só confira.)

### 3.4. Publicar as funções do servidor

No terminal, dentro da pasta do site:

```powershell
cd C:\Users\KABUM\Desktop\Druza_site
supabase functions deploy admin-list-orders
supabase functions deploy admin-update-order
supabase functions deploy admin-get-order
supabase functions deploy admin-list-products
supabase functions deploy admin-upsert-product
supabase functions deploy admin-delete-product
supabase functions deploy create-order
supabase functions deploy process-payment
```

Pronto. A configuração acabou — daqui pra frente é só usar.

---

## 4. Primeiro acesso: ativar o 2FA

1. No celular, instale um app autenticador (**Google Authenticator**, **Authy**
   ou **1Password**).
2. No computador, abra **`admin-login.html`** e entre com e-mail + senha.
3. O painel vai pedir para **ativar a verificação em duas etapas**. Clique em
   **"Gerar QR Code"**.
4. No app do celular, escolha "adicionar conta" / "escanear QR" e aponte para o
   QR na tela. (Não consegue escanear? Digite o código de texto que aparece
   embaixo do QR.)
5. O app passa a mostrar um código de 6 dígitos que muda sozinho. Digite o código
   atual no campo e clique **"Ativar e entrar"**.
6. Feito — o 2FA está ativo e o painel abre.

> Guarde o app com cuidado. A partir de agora, **todo** login pede esse código.

---

## 5. Como acessar no dia a dia

1. Abra **`admin-login.html`** (ex.: `https://druza.com.br/admin-login.html`).
2. Digite e-mail + senha → **Continuar**.
3. Digite o código de 6 dígitos do app → **Entrar**.
4. Você cai no painel, com as abas **Pedidos** e **Produtos**.

Para sair, use o botão **Sair** no topo do painel.

> **Dica:** a URL do admin não tem link visível na loja (fica mais discreto).
> Salve `admin-login.html` nos favoritos. Se quiser, posso adicionar um link
> discreto em algum canto — é só pedir.

---

## 6. Como usar: Pedidos

Na aba **Pedidos**:

- **Filtrar / buscar:** use o seletor de status e o campo de busca (por e-mail ou
  número do pedido).
- **Ver detalhes (logística):** clique em **"Detalhes"** no pedido. Abre uma
  janela com tudo que você precisa para separar e enviar:
  - Cliente: nome, e-mail, telefone.
  - Endereço de entrega completo (com CEP).
  - Itens do pedido e valores.
  - Forma de pagamento realmente usada (cartão/Pix/boleto, parcelas, status).
- **Atualizar status e rastreio:** no próprio pedido, escolha o novo status; ao
  marcar como **Enviado**, preencha o **código de rastreio** e clique **Salvar**.
  O cliente vê o status atualizado na conta dele.

Fluxo típico de envio: pedido aparece como **Pago** → você separa a peça usando o
**Detalhes** → posta nos Correios/transportadora → volta no painel, marca
**Enviado** e cola o **código de rastreio** → **Salvar**.

---

## 7. Como usar: Produtos

Na aba **Produtos**:

- **Criar produto:** clique **"+ Novo produto"**, preencha:
  - **Slug**: identificador único, sem espaço nem acento (ex.: `anel-lua-prata`).
    Não muda depois de criado.
  - **Nome**, **categoria** (ex.: `aneis`, `brincos`, `pulseiras`, `colares`),
    **preço**.
  - **Ativo**: se desmarcado, some do site e não pode ser comprado.
  - **Em estoque**: se desmarcado, aparece como "Esgotado" e não vende.
  - **Destaque na página inicial**: aparece no grid de destaque da home.
- **Editar:** clique **"Editar"**, mude o que quiser (preço, estoque, destaque…)
  e salve. O site reflete na hora.
- **Excluir:** clique **"Excluir"**. Pedidos antigos **não** são afetados (eles
  guardam uma cópia dos dados na hora da compra).

> **Produto novo criado aqui** já fica comprável imediatamente, com uma página
> própria em `produto.html?slug=SEU-SLUG` e listado em `catalogo.html`. A **foto**
> entra depois (ver seção 8 e Futuros upgrades) — até lá, ele aparece com um
> "Foto em breve" honesto.

---

## 8. Preço e catálogo: como o site fica sincronizado

- O **preço** e a **disponibilidade** que você define no painel são a fonte única
  da verdade. O site busca esses dados ao vivo do banco, então o **preço exibido é
  sempre o mesmo que o checkout cobra** — nunca ficam desencontrados.
- Produto marcado como **inativo** ou **sem estoque** some do site / aparece como
  esgotado automaticamente.
- **Destaque** controla o que aparece no grid da página inicial.
- O que **ainda vem do código** (não do painel): **fotos, galeria, descrição
  longa, material e tamanhos**. Para produtos novos, isso entra quando as fotos
  ficarem prontas. O painel cobre todo o lado **operacional** (preço, estoque,
  visibilidade, destaque, nome, categoria).

Páginas do catálogo:
- `catalogo.html` — lista **todas** as peças ativas.
- `produto.html?slug=...` — página de **qualquer** produto (inclusive os novos).
- `produtos/*.html` — páginas fixas dos 7 produtos originais (com fotos e textos
  completos).

---

## 9. Se perder o celular (recuperação)

Você **nunca** fica travado dos seus dados, porque sempre tem o painel do Supabase.
Para reativar o 2FA num aparelho novo:

1. Supabase → **Authentication → Users** → abra a sua conta.
2. Remova o fator MFA existente (ou, no SQL Editor:
   `delete from auth.mfa_factors where user_id = 'SEU-USER-ID';`).
3. Faça login em `admin-login.html` de novo — o painel vai pedir para **ativar o
   2FA** outra vez. Escaneie o novo QR no celular novo.

---

## 10. Futuros upgrades

Ideias já mapeadas, em ordem sugerida de valor:

| Upgrade | O que é | Complexidade |
|---|---|---|
| **CMS de fotos/descrição** | Subir foto e editar descrição/galeria/tamanhos do produto pelo próprio painel (hoje isso é no código). Envolve upload de imagem (Supabase Storage) + editor de texto. | Média-alta |
| **Reembolso pelo painel** | Botão que dispara o estorno real no MercadoPago (hoje só muda status interno; o estorno é feito no painel do MP). Mexe com dinheiro real — exige cuidado extra. | Média |
| **Filtros/busca de produtos e categorias no site** | Página de categoria dinâmica, busca funcional, wishlist. | Média |
| **Painel de métricas** | Vendas por período, produtos mais vendidos, ticket médio — um "resumo do negócio" na abertura do admin. | Média |
| **E-mails automáticos** | Confirmação de pedido e aviso de envio por e-mail (Resend), quando o domínio estiver ativo. | Baixa-média |
| **Códigos de backup do 2FA** | Códigos de emergência para não depender só do celular. | Baixa |
| **Multi-admin com papéis** | Mais de um admin, com níveis (ex.: quem só vê pedidos vs. quem edita produtos). | Média |

Para qualquer um deles, é só pedir que eu detalho e implemento.

---

*Última atualização: 2026-07-02. Arquivos principais do admin: `admin-login.html`,
`admin.html`, `js/admin.js`, `supabase/functions/admin-*`,
`supabase/functions/_shared/require-admin.ts`, `db/schema-admin.sql`.*

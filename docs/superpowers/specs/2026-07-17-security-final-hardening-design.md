# Endurecimento final de seguranca

Data: 17 de julho de 2026

## Objetivo

Eliminar as falhas encontradas na auditoria final do cadastro, dados pessoais,
pedidos e pagamentos da Druza, mantendo o site estatico compativel com GitHub
Pages e usando o Supabase como camada de autenticacao, autorizacao e banco.

## Achados confirmados

1. `authenticated` pode inserir diretamente em `orders` e `order_items`. A
   policy confere apenas dono e status inicial, mas permite que totais, itens e
   referencias de pagamento sejam escolhidos pelo cliente. Isso permite criar
   um pedido de valor manipulado e envia-lo ao fluxo de cobranca.
2. `process-payment` verifica `pending` e depois chama o Mercado Pago sem uma
   reserva atomica. Duas requisicoes simultaneas podem cobrar o mesmo pedido.
3. A chave de idempotencia atual e aleatoria em cada chamada. Uma repeticao de
   rede nao reaproveita a mesma operacao no Mercado Pago.
4. O webhook aceita pagamento aprovado sem exigir que `transaction_amount`
   seja numerico e pode rebaixar um pedido pago por causa de evento atrasado.
5. O banco real ainda possui grants amplos e policies antigas destinadas a
   `public`, embora parte dos scripts locais ja use `TO authenticated`.
6. `public.touch_updated_at()` esta executavel por papeis publicos no banco
   real e sem `search_path` fixo.
7. Enderecos dependem principalmente da validacao do navegador e permitem
   escrita em colunas de controle como `id`, `user_id` e `created_at`.
8. `profiles` permite ao cliente selecionar `payment_customer_id`, um campo
   interno que nao e necessario na interface.
9. `js/config.js` esta ignorado pelo Git. Como o GitHub Pages publica somente
   arquivos versionados, autenticacao e checkout nao recebem configuracao.
10. A protecao de senhas vazadas esta desativada no projeto Supabase.

## Arquitetura aprovada

### Limite de confianca

O navegador podera somente:

- criar e autenticar usuarios pelo Supabase Auth;
- ler e alterar os proprios dados permitidos por RLS;
- chamar Edge Functions autenticadas;
- ler o catalogo publico ativo.

O navegador nao podera inserir ou alterar pedidos, itens, campos financeiros,
produtos, administradores ou logs. A `service_role` continuara exclusivamente
nas Edge Functions e nunca sera publicada no GitHub Pages.

### Criacao de pedido

`create-order` validara o JWT com o Supabase Auth e usara um cliente
privilegiado apenas depois dessa validacao. A Edge Function verificara o dono
do endereco e os limites do payload e chamara uma funcao SQL restrita a
`service_role`. Essa funcao revalidara produtos e precos, calculara os valores,
reservara estoque e gravara pedido e itens na mesma transacao. Uma falha em
qualquer etapa revertera tudo, sem deixar pedido incompleto.

As policies e grants de INSERT de `orders` e `order_items` para clientes serao
removidos. Assim, chamar a Data API diretamente nao contornara o calculo do
servidor.

### Processamento e idempotencia

Antes de chamar o Mercado Pago, `process-payment` fara um UPDATE condicional
de `pending` para `processing`. O mesmo UPDATE gravara uma chave de tentativa e
uma impressao criptografica do payload, sem guardar token de cartao.

Somente a primeira requisicao conquista a tentativa. Uma repeticao identica
reutiliza a mesma chave de idempotencia; uma requisicao diferente enquanto o
pedido esta em processamento e recusada. Pagamento recusado libera o pedido
para nova tentativa. Pagamento pendente permanece protegido ate o webhook.

Uma funcao de reconciliacao executada a cada cinco minutos tratara pedidos em
`processing` ha mais de 15 minutos. Antes de reconquistar ou expirar o pedido,
ela consultara o pagamento pelo `mp_payment_id` ou pesquisara no Mercado Pago
por `external_reference`. Somente quando nenhuma cobranca existir a tentativa
podera voltar a `pending`. Isso evita tanto pedido preso quanto cobranca dupla
depois de timeout ou queda da Edge Function.

### Webhook e transicoes

O webhook exigira `x-signature`, `x-request-id`, timestamp e um ID de pagamento
numerico antes de fazer qualquer consulta externa. A assinatura HMAC SHA-256
sera validada com comparacao em tempo constante contra os secrets configurados;
assinatura ausente ou invalida sera rejeitada. Depois disso, o pagamento sera
reconsultado diretamente no Mercado Pago e `external_reference` devera apontar
para o pedido local encontrado.

O identificador da notificacao assinada sera consultado antes da API: replay
exato ja aplicado retornara sucesso sem nova consulta. Depois da reconsulta,
eventos tambem serao deduplicados por pagamento e status. O registro do evento
e a mudanca do pedido ocorrerao na mesma transacao para que uma falha no banco
nao transforme uma tentativa incompleta em duplicata aceita.

Valores serao convertidos para centavos inteiros por uma rotina decimal
estrita, sem comparacao de `float`. Pagamento aprovado exigira valor positivo e
igual ao total do pedido em centavos; qualquer divergencia sera rejeitada.

Uma unica funcao SQL e um trigger implementarao a whitelist da maquina de
estados. As transicoes permitidas serao:

- `pending -> processing | canceled`;
- `processing -> pending | paid | canceled`;
- `paid -> shipped | refunded`;
- `shipped -> delivered | refunded`;
- `delivered -> refunded`;
- `canceled -> paid`, apenas para confirmacao financeira tardia;
- `refunded` e terminal.

Atualizacoes sem mudanca de status serao permitidas. `process-payment`, webhook,
reconciliacao e painel administrativo passarao pela mesma regra, eliminando
blacklists diferentes em cada funcao.

### Estoque, reserva e snapshot

`products` recebera `stock_quantity`, inteiro nao negativo. Na migracao, cada
produto atualmente marcado `in_stock = true` iniciara conservadoramente com uma
unidade; produtos indisponiveis iniciarao com zero. O painel administrativo
ganhara o campo de quantidade para o valor real ser ajustado pela loja.

A criacao do pedido chamara uma funcao SQL transacional que:

1. bloqueia os produtos em ordem deterministica;
2. revalida ativo, quantidade e preco atual;
3. calcula subtotal e desconto com os valores atuais;
4. cria pedido e itens;
5. decrementa o estoque como reserva;
6. define expiracao inicial da reserva em 30 minutos.

No maximo tres reservas nao pagas poderao ficar ativas por usuario. Reservas
expiradas serao reconciliadas com o Mercado Pago antes de devolver o estoque.
Ao aprovar, a reserva e consumida sem novo decremento; ao cancelar ou confirmar
que nao houve pagamento, o estoque e devolvido uma unica vez. Para Pix pendente,
a expiracao acompanha `date_of_expiration` devolvida pelo gateway quando houver.

`order_items` continuara guardando `product_slug`, `product_name`,
`unit_price_cents` e `qty`. Esse snapshot preserva historico e reembolso mesmo
quando nome ou preco do produto mudar.

### Dados pessoais e RLS

A migracao aplicara menor privilegio por tabela e por coluna:

- `profiles`: leitura apenas dos campos exibidos e atualizacao apenas de nome,
  telefone, nascimento e consentimento;
- `addresses`: CRUD somente das proprias linhas, sem alterar identidade,
  proprietario ou data de criacao;
- `orders` e `order_items`: somente leitura das proprias linhas e das colunas
  necessarias ao historico;
- `products`: somente leitura publica de produtos ativos;
- `admins`: o usuario autenticado pode consultar apenas a propria identificacao;
- `admin_audit_log`: nenhum acesso pelo cliente.

Policies antigas serao recriadas com papeis explicitos e `(select auth.uid())`.
Funcoes de trigger terao `search_path = ''` e EXECUTE publico revogado. Tambem
serao adicionadas restricoes de formato e tamanho para enderecos e indices de
chaves estrangeiras ausentes.

### CORS, limites e automacao abusiva

As Edge Functions chamadas pelo navegador aceitarao apenas os origins de
`https://druza.com.br`, `https://www.druza.com.br` e
`https://brunocarreirocs.github.io`, alem de origins adicionais configurados em
`ALLOWED_ORIGINS`. Requisicoes de servidor sem `Origin` continuarao permitidas;
origins de navegador desconhecidos receberao 403.

O amortecedor por IP sera mantido e um limite persistente por `user_id` sera
adicionado no PostgreSQL: criacao de pedidos e tentativas de pagamento terao
janelas independentes. O limite sera consumido somente depois da validacao do
JWT e nao podera ser contornado por cold start de uma Edge Function.

O cadastro aceitara `captchaToken` e exibira Cloudflare Turnstile quando uma
site key estiver configurada. A ativacao efetiva depende da site key/secret no
Cloudflare e da opcao Captcha no Supabase Auth; sem essas credenciais, o codigo
ficara preparado, mas o painel ainda exigira configuracao manual.

### E-mail e cadastro duplicado

A conta ganhara um formulario para solicitar troca de e-mail com
`auth.updateUser`. Com Secure Email Change habilitado, o Supabase exigira
confirmacao no e-mail atual e no novo. O identificador do perfil continuara o
UUID de `auth.users`, portanto a troca nao sobrescrevera outro cadastro.

O cadastro mantera uma resposta neutra quando o Supabase ocultar e-mails ja
existentes. Isso evita enumeracao publica de contas. Quando o Auth devolver um
erro explicito de duplicidade, a interface orientara login ou recuperacao.

### GitHub Pages

Sera criado um arquivo versionado contendo somente URL, publishable key do
Supabase e Public Key do Mercado Pago. Esses valores sao feitos para o
navegador. Nenhuma secret key, `service_role` ou Access Token sera versionado.

## Erros e respostas

Mensagens publicas nao exibirao detalhes internos do PostgreSQL ou respostas
completas do gateway. Informacoes tecnicas ficarao nos logs das Edge Functions.
Erros de autenticacao continuarao sem revelar se uma conta existe quando o
Supabase aplicar protecao contra enumeracao.

Logs nao incluirao nome, e-mail, telefone, endereco, token de cartao, payload de
`payer`, QR Pix completo, Access Token ou resposta integral do gateway. Poderao
conter apenas IDs tecnicos, status, codigo HTTP e identificador de correlacao.

## Backup e rollback

Antes da migracao sera salvo um inventario das policies, grants, funcoes,
constraints e versoes das Edge Functions atuais. Um script de rollback
restaurara as permissoes e policies anteriores sem apagar colunas ou dados
criados. O commit anterior servira como fonte para redeploy rapido das versoes
antigas das Edge Functions caso o checkout precise ser revertido.

## Verificacao

1. Validacao sintatica de JavaScript e TypeScript disponivel localmente.
2. Busca estatica por secrets, grants amplos e chamadas privilegiadas.
3. Aplicacao da migracao no projeto Supabase ativo.
4. Redeploy de `create-order`, `process-payment`, `webhook-mp` e reconciliacao.
5. Consultas de verificacao para ACLs, policies, funcoes e constraints.
6. Execucao dos advisors de seguranca e performance depois da migracao.
7. Testes negativos sem modificar pedidos reais: INSERT direto bloqueado,
   leitura cruzada bloqueada e funcao publica nao executavel.
8. Teste concorrente de duas chamadas de `process-payment`, confirmando que
   somente uma conquista a tentativa e ambas usam resultado idempotente.
9. Replay do mesmo webhook, confirmando resposta 200 sem segundo efeito.
10. Testes de reserva: duas compras da ultima unidade, expiracao e devolucao
    unica de estoque.
11. Teste do site publicado para confirmar carregamento da configuracao.

## Item manual

No plano Free, a protecao contra senhas vazadas pode nao estar disponivel. Se
o painel permitir, ela deve ser habilitada em Authentication > Sign In /
Providers > Email. Os requisitos de comprimento e caracteres permanecerao
obrigatorios no Auth e na interface independentemente desse recurso.

Turnstile exige criar site key e secret fora do Supabase. A implementacao nao
inventara nem publicara essas credenciais; a documentacao final indicara os
campos exatos para o proprietario preencher.

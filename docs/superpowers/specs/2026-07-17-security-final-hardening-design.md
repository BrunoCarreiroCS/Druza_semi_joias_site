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
privilegiado apenas depois dessa validacao. A funcao verificara explicitamente
o dono do endereco, validara formato e limites do payload, consultara somente
produtos ativos e em estoque, recalculara todos os valores e gravara pedido e
itens. Se a gravacao dos itens falhar, o pedido incompleto sera removido.

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

### Webhook e transicoes

O webhook continuara reconsultando o pagamento diretamente no Mercado Pago.
Para aprovar, exigira valor numerico, positivo e igual ao total do pedido.
Eventos atrasados nao poderao transformar `paid`, `shipped`, `delivered` ou
`refunded` em `pending` ou `canceled`. Estorno e chargeback poderao promover o
pedido para `refunded`.

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

## Verificacao

1. Validacao sintatica de JavaScript e TypeScript disponivel localmente.
2. Busca estatica por secrets, grants amplos e chamadas privilegiadas.
3. Aplicacao da migracao no projeto Supabase ativo.
4. Redeploy de `create-order`, `process-payment` e `webhook-mp`.
5. Consultas de verificacao para ACLs, policies, funcoes e constraints.
6. Execucao dos advisors de seguranca e performance depois da migracao.
7. Testes negativos sem modificar pedidos reais: INSERT direto bloqueado,
   leitura cruzada bloqueada e funcao publica nao executavel.
8. Teste do site publicado para confirmar carregamento da configuracao.

## Item manual

No plano Free, a protecao contra senhas vazadas pode nao estar disponivel. Se
o painel permitir, ela deve ser habilitada em Authentication > Sign In /
Providers > Email. Os requisitos de comprimento e caracteres permanecerao
obrigatorios no Auth e na interface independentemente desse recurso.

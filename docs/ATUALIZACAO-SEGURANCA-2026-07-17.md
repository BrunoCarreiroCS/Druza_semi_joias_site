# Atualização final de segurança

- **Projeto:** Druza Semi Joias
- **Data:** 17/07/2026
- **Conclusão da aplicação:** 17/07/2026 às 18:08 (America/Sao_Paulo)
- **Estado:** aplicado no código e no projeto Supabase `hqkpgghlbwincahfwkem`

## Resumo

Foi concluído o endurecimento de cadastro, dados pessoais, autorização,
pedidos, estoque e pagamentos. As decisões sensíveis ficam no PostgreSQL ou nas
Edge Functions; o navegador apenas coleta dados e exibe respostas públicas.

Nenhuma senha é salva em tabelas públicas. O Supabase Auth mantém credenciais e
unicidade de e-mail. Nenhuma chave administrativa, token do Mercado Pago ou
segredo de webhook foi colocado no front-end ou no Git.

## Falhas encontradas e correções

| Achado | Correção aplicada |
| --- | --- |
| Cadastro permitia validações dependentes apenas do navegador | Nome, telefone brasileiro, DDD, nascimento obrigatório e idade entre 18 e 120 anos são revalidados por trigger no banco |
| Maioridade usava a data UTC do PostgreSQL | A data legal agora é calculada explicitamente em `America/Sao_Paulo`, evitando aceitar aniversário um dia cedo na janela noturna |
| Três perfis antigos estavam incompletos | Dados foram preservados; um trigger bloqueia somente novos pedidos até o próprio titular concluir o cadastro em `conta.html` |
| Cliente podia tentar criar pedidos/itens diretamente | Grants e policies de INSERT foram removidos; criação ocorre por RPC transacional chamada com `service_role` na Edge Function |
| Preço e estoque sujeitos a corrida/oversell | Pedido recalcula preço no banco, grava snapshot e reserva estoque atomicamente sob locks ordenados |
| Valores de pagamento podiam sofrer comparação decimal | Totais e validações usam centavos inteiros |
| Duas chamadas simultâneas podiam iniciar cobranças | Claim atômico e chave idempotente persistida; a segunda chamada reutiliza a tentativa |
| Pedido podia ficar preso em `processing` | Reconciliador consulta o Mercado Pago e um job executa a cada cinco minutos |
| Estados financeiros eram protegidos por exceções parciais | Máquina de estados por whitelist centralizada no PostgreSQL |
| Webhook aceitava notificação sem autenticação própria | HMAC de `x-signature`, ID conhecido, nova consulta autenticada ao MP, `external_reference`, valor e replay são validados |
| CORS aberto e limite somente em memória | Allowlist de origem e rate limit durável por usuário no PostgreSQL, além do amortecedor por IP |
| Mapa do rate limit por IP podia ultrapassar o teto nominal | Capacidade de 5.000 entradas agora é imposta com limpeza de expirados e remoção da entrada mais antiga |
| Histórico dependia do preço/endereço atual | Itens gravam nome e preço do momento; novos pedidos gravam snapshot imutável do endereço |
| Erros e auditoria podiam registrar detalhes demais | Respostas públicas são genéricas e logs/auditoria não recebem senha, cartão, payload completo ou PII desnecessária |
| Admin dependia demais do front-end | Todas as funções administrativas exigem JWT, registro em `admins` e sessão MFA `aal2` no servidor |
| Troca de e-mail podia parecer sobrescrever cadastro | Usa Supabase Auth, exige e-mail diferente e confirmação segura; unicidade impede sobreposição |
| Fontes locais geravam 404 | Caminhos de `@font-face` foram corrigidos e conferidos no navegador |

## Cadastro e e-mail duplicado

- O e-mail é obrigatório e validado no front e no Supabase Auth.
- `auth.users` possui índices de unicidade e a auditoria encontrou zero e-mails
  duplicados.
- No cadastro, a mensagem para e-mail já existente é deliberadamente genérica:
  isso evita que terceiros descubram quais pessoas possuem conta.
- Na troca de e-mail autenticada, quando o Auth informa conflito, a interface
  mostra `Este e-mail já está sendo utilizado.`
- Alterar o e-mail não cria nem sobrescreve outro perfil. A alteração pertence
  ao mesmo `user_id` e segue o fluxo de confirmação do Supabase.

## Banco de dados aplicado

Migrações registradas no projeto:

1. `20260717202522_security_final_hardening_20260717`
2. `20260717202730_schedule_payment_reconciliation_20260717`
3. `20260717203935_enforce_checkout_profile_completion_20260717`
4. `20260717205809_use_brazil_date_for_age_validation_20260717`

Controles principais:

- RLS e grants mínimos por tabela/coluna;
- schema `private` sem acesso de `anon`/`authenticated`;
- rate limits duráveis sem PII na chave;
- estoque quantitativo, reserva, consumo e devolução;
- snapshots de item e endereço;
- ledger idempotente de eventos de pagamento;
- transições de estado explícitas;
- trigger de perfil obrigatório antes de qualquer novo pedido;
- maioridade calculada pela data civil de `America/Sao_Paulo`;
- cron de reconciliação ativo a cada cinco minutos.

## Edge Functions publicadas

| Função | Versão | JWT |
| --- | ---: | --- |
| `create-order` | 9 | obrigatório |
| `process-payment` | 10 | obrigatório |
| `webhook-mp` | 27 | HMAC próprio; JWT desativado por ser webhook |
| `reconcile-stale-payments` | 2 | rota sem parâmetros, rate limit/lock durável; JWT desativado |
| `admin-list-orders` | 7 | obrigatório + admin + MFA |
| `admin-update-order` | 7 | obrigatório + admin + MFA |
| `admin-get-order` | 6 | obrigatório + admin + MFA |
| `admin-list-products` | 6 | obrigatório + admin + MFA |
| `admin-upsert-product` | 6 | obrigatório + admin + MFA |
| `admin-delete-product` | 6 | obrigatório + admin + MFA |

## Verificações executadas

- Sintaxe de todos os JavaScripts e scripts inline: aprovada.
- Build das 10 Edge Functions: aprovado; deploys ficaram `ACTIVE`.
- Teste de capacidade criou 5.001 chaves de IP e confirmou o teto de 5.000,
  a expulsão da entrada mais antiga e o HTTP 429 na repetição.
- Smoke test SQL completo em transação com `ROLLBACK`: aprovado.
- Duas chamadas simultâneas de pagamento: estados `claimed` e `replay`, com a
  mesma chave de tentativa.
- Replay do mesmo webhook: segunda aplicação retornou `duplicate`/no-op.
- Assinatura inválida do webhook: HTTP 401; evento sem ID: HTTP 400.
- Função de pedido sem JWT: HTTP 401.
- Preflight da origem GitHub Pages: HTTP 204; origem não autorizada: HTTP 403.
- Cadastro recusou DDD inválido, menor de 18 anos e senha fraca.
- Teste de fronteira no banco recusou 17 anos e 364 dias e aceitou exatamente
  18 anos, usando a data brasileira; a transação foi revertida.
- Página de cadastro e formulário de dados pessoais conferidos em desktop e
  390 px, sem sobreposição e com console do navegador sem erros.
- Scanner de literais sensíveis: nenhum secret encontrado.
- Advisor do Supabase: nenhuma vulnerabilidade nova de schema. Os três avisos
  `RLS enabled no policy` são deny-all intencional para rate limit, auditoria e
  eventos; somente `service_role` acessa essas tabelas.

## Preservação de dados

Antes e depois dos testes permaneceram: 3 perfis, 2 endereços, 45 pedidos, 45
itens, 7 produtos e 1 administrador. Nenhum fixture de teste permaneceu.

Há quatro pedidos legados sem snapshot de endereço: dois pagos e dois
cancelados. Eles também não possuem mais referência de endereço, portanto o
destino histórico não pode ser reconstruído com segurança. Nenhum dado foi
inventado. Todos os pedidos que ainda tinham referência foram migrados e todos
os novos pedidos recebem snapshot obrigatório pelo fluxo protegido.

## Ações manuais ainda necessárias

Estas configurações dependem de conta/plano ou chaves externas e não podem ser
ativadas com segurança apenas pelo Git:

1. Em **Authentication > Sign In / Providers > Email**, manter confirmação de
   e-mail, `Secure email change`, `Secure password change` e
   `Require current password when updating` ligados. Usar mínimo de 8 caracteres
   e exigir maiúscula, minúscula, número e símbolo.
2. Ativar **Leaked Password Protection** se o plano Supabase permitir. Este é o
   único aviso `WARN` restante no Security Advisor.
3. Em **Authentication > Attack Protection**, configurar Cloudflare Turnstile.
   Depois preencher somente a Site Key pública em `js/config.public.js`; o
   secret fica exclusivamente no Supabase Auth.
4. Conferir **URL Configuration**, manter Redirect URLs somente dos domínios
   utilizados e configurar SMTP próprio antes de volume de produção.
5. Antes de vendas reais, trocar as credenciais TEST do Mercado Pago pelas de
   produção, revisar a allowlist CORS e fazer um pagamento real de baixo valor.

## Rollback

O inventário anterior está em `docs/security-backup-2026-07-17.md`. O rollback
operacional está em `db/security-final-hardening-rollback.sql`; ele preserva
dados, desativa temporariamente os novos gates e deve ser usado somente junto
da restauração das versões anteriores das Edge Functions.

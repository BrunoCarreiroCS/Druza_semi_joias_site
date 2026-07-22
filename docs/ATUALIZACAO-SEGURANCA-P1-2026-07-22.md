# Atualizacao de seguranca P1 - Storage e senhas vazadas

## Prioridade 1 concluida: listagem do bucket

- removida a policy `product_images_public_read` de `storage.objects`;
- o bucket `product-images` permanece publico para URLs conhecidas;
- preservadas as policies administrativas de `INSERT`, `UPDATE` e `DELETE`;
- o source-of-truth nao recria mais a policy ampla;
- smoke test consulta somente metadados e nunca lista arquivos.

A migration remota `restrict_product_images_public_listing`, versao
`20260722235222`, foi aplicada. O smoke transacional passou e o Security
Advisor nao retorna mais `public_bucket_allows_listing`.

O fluxo local e compativel com a mudanca: a vitrine usa URLs gravadas em
`public.product_images`; o painel usa upload com `upsert: false` e
`getPublicUrl`. Nao ha chamada a `list()` no projeto.

## Prioridade 1 bloqueada pelo plano: senhas vazadas

O controle **Prevent use of leaked passwords** foi tentado no Dashboard, mas a
organizacao esta no plano Free. O proprio Dashboard informa que o recurso esta
disponivel apenas no Pro e acima, e a tentativa de salvar retornou erro 500.
A alteracao nao salva foi descartada; nenhuma configuracao parcial permaneceu.
O Security Advisor continua retornando `auth_leaked_password_protection`, como
esperado enquanto o recurso estiver indisponivel no plano atual.

Nao foi feito upgrade, compra ou alteracao de faturamento. Depois de uma
autorizacao especifica para mudar o plano, habilitar o controle e confirmar que
o advisor `auth_leaked_password_protection` desapareceu.

## Privacidade e limites observados

- nenhum objeto do Storage foi listado ou lido;
- nenhuma tabela de usuarios foi consultada;
- nenhuma senha, email, pedido ou outro dado pessoal foi acessado;
- nenhuma assinatura ou cobranca foi alterada.

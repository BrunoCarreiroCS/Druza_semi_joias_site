# Snapshot de seguranca antes da migracao

Data: 17/07/2026 (America/Sao_Paulo)

Projeto Supabase: `Druza-semi-joias` (`hqkpgghlbwincahfwkem`)

Commit de referencia anterior a implementacao: `d641606`

Este documento registra apenas metadados operacionais. Nao contem chaves, tokens, e-mails, telefones, enderecos, payloads de pagamento ou outros dados pessoais.

## Contagem de linhas

| Tabela | Linhas aproximadas |
| --- | ---: |
| `profiles` | 3 |
| `addresses` | 2 |
| `orders` | 45 |
| `order_items` | 45 |
| `products` | 7 |
| `admins` | 1 |
| `admin_audit_log` | 14 |

## Edge Functions ativas

| Funcao | Versao | JWT | SHA-256 implantado |
| --- | ---: | --- | --- |
| `webhook-mp` | 25 | nao | `499079202c266e96ea4b1364f13dd23eed78f2db61bf46f03e885b85c8dd1b2a` |
| `create-order` | 6 | sim | `630a714401cac354de001d306e5d190207ab15e3661c70e82d4abf1e35c59097` |
| `process-payment` | 8 | sim | `9ab05a7bd20701097ea86c9e2e527817e09d1e0b6fdb058d31385b08096a26de` |
| `admin-list-orders` | 5 | sim | `e706c4dca2fa295224e73dd577c076228370728d0db8ff1d480ec1042c0cc46d` |
| `admin-update-order` | 5 | sim | `c39d4f972139d91e22f170097bbd1ccfb6482e2565a90b878c4fabeb96e20145` |
| `admin-get-order` | 4 | sim | `b9cafa2c84162cf011c73ce97cde4bc43205dd21b03c99bd8fff861c55c03436` |
| `admin-list-products` | 4 | sim | `4b80dbc08a324bcaaf1f784af4d37b3cb8df41978d55c89474bba53939a50394` |
| `admin-upsert-product` | 4 | sim | `d0aeb1f5606483c6ddb476d982e4af1f21702c99f75513a1db2ef36c5c5741ea` |
| `admin-delete-product` | 4 | sim | `13dfd1d467fc92e90a98cab9e98b49a6642bddaf07d3f8e9ac9ca808d851c757` |

## Estado de acesso encontrado

- RLS estava habilitado nas tabelas publicas, mas diversas politicas antigas usavam o papel `public` e `auth.uid()` sem o subselect recomendado.
- `anon` e `authenticated` possuiam privilegios de tabela excessivos, incluindo combinacoes de `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` e `TRIGGER` herdadas dos ACLs padrao.
- `orders_insert_own_pending` e `order_items_insert_own` permitiam ao navegador criar diretamente pedidos e itens. O cliente podia escolher valores e referencias sem passar pela validacao transacional do servidor.
- `profiles` permitia `SELECT` amplo da linha, incluindo o campo interno `payment_customer_id`.
- `admin_audit_log` tinha RLS sem politica, mas os ACLs herdados ainda concediam privilegios desnecessarios aos papeis de cliente.
- `touch_updated_at()` nao fixava `search_path` e tinha permissao de execucao herdada.
- Nao havia indice para `orders.shipping_address_id`.
- Nao havia controle quantitativo/reserva atomica de estoque.
- Nao havia historico de migracoes registrado no projeto.

## Alertas dos advisors antes da mudanca

- Funcao `touch_updated_at()` com `search_path` mutavel.
- Protecao contra senhas vazadas desabilitada (recurso dependente do plano do Supabase).
- RLS habilitado sem politica em `admin_audit_log` (intencional para negar acesso pelo cliente).
- Politicas antigas com reavaliacao de `auth.uid()` por linha.
- Indice ausente na FK `orders_shipping_address_id_fkey`.

## Recuperacao

O arquivo `db/security-final-hardening-rollback.sql` restaura temporariamente o contrato antigo de checkout e as politicas anteriores. Ele nao apaga colunas nem dados novos. Use apenas em incidente, porque reabrir `INSERT` direto em pedidos e itens recria a vulnerabilidade que esta migracao corrige.

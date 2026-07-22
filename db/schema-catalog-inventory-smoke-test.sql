-- =====================================================================
-- DRUZA - smoke test de catalogo, estoque e pedidos
--
-- Executar somente depois de db/schema-catalog-inventory.sql.
-- O teste roda dentro de uma transacao e termina em ROLLBACK: nenhum
-- fixture permanece no banco.
--
-- Cada verificacao levanta uma excecao com nome proprio quando falha, no
-- mesmo estilo de db/security-final-hardening-smoke-test.sql. Se o script
-- terminar imprimindo "smoke test completo", tudo passou.
-- =====================================================================

begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_address_id uuid;
  v_product_id uuid;
  v_second_id uuid;
  v_saved jsonb;
  v_move jsonb;
  v_replay jsonb;
  v_order jsonb;
  v_order_id uuid;
  v_cancel_order_id uuid;
  v_total integer;
  v_stock integer;
  v_reserved integer;
  v_physical integer;
  v_count integer;
  v_text text;
  v_bool boolean;
  v_applied jsonb;
  v_duplicate jsonb;
  v_idempotency uuid := gen_random_uuid();
begin
  -- -----------------------------------------------------------------
  -- Fixtures: uma administradora, uma cliente e um endereco de entrega.
  -- -----------------------------------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  values (
    v_admin_id, 'admin.smoke@druza.test',
    jsonb_build_object(
      'full_name', 'Admin Smoke Test',
      'phone', '+5511987654321',
      'birth_date', '1990-01-01'
    )
  );
  insert into public.admins (user_id, note) values (v_admin_id, 'smoke test');

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    v_client_id, 'cliente.smoke@druza.test',
    jsonb_build_object(
      'full_name', 'Cliente Smoke Test',
      'phone', '+5511912345678',
      'birth_date', '1992-05-10'
    )
  );

  insert into public.addresses (
    user_id, label, recipient, cep, street, number, neighborhood, city, state
  ) values (
    v_client_id, 'Casa', 'Cliente Smoke Test', '01310100',
    'Avenida Paulista', '1000', 'Bela Vista', 'Sao Paulo', 'SP'
  )
  returning id into v_address_id;

  -- =================================================================
  -- PRODUTOS
  -- =================================================================

  -- 1) Cadastro de produto pelo painel, com foto e estoque inicial.
  v_saved := public.admin_save_product(
    v_admin_id, null,
    jsonb_build_object(
      'slug', 'smoke-anel-teste',
      'name', 'Anel Smoke Test',
      'sku', 'SMOKE-001',
      'status', 'active',
      'category_id', (select id from public.categories where slug = 'aneis'),
      'collection', 'Testes',
      'tags', jsonb_build_array('teste', 'smoke'),
      'short_description', 'Peca usada apenas no teste automatizado.',
      'long_description', 'Descricao longa do produto de teste.',
      'price_cents', 20000,
      'promo_price_cents', 18000,
      'cost_cents', 8000,
      'min_stock', 2,
      'featured', true,
      'attributes', jsonb_build_object('material', 'Prata 925', 'pedra', 'Esmeralda'),
      'seo_title', 'Anel Smoke Test'
    ),
    jsonb_build_array(
      jsonb_build_object('url', 'img/anel-coracao.webp', 'alt', 'Foto principal', 'is_primary', true),
      jsonb_build_object('url', 'img/anel-paraiba.webp', 'alt', 'Segunda foto', 'is_primary', false)
    ),
    10
  );
  v_product_id := (v_saved->>'id')::uuid;
  if v_product_id is null or (v_saved->>'created')::boolean is not true then
    raise exception 'test_failed_product_create';
  end if;

  -- 2) O produto ativo aparece para a loja (a policy usa active = true).
  select active, stock_quantity, category into v_bool, v_stock, v_text
  from public.products where id = v_product_id;
  if v_bool is not true then raise exception 'test_failed_active_flag_not_synced'; end if;
  if v_stock <> 10 then raise exception 'test_failed_initial_stock'; end if;
  if v_text <> 'aneis' then raise exception 'test_failed_category_slug_not_synced'; end if;

  -- 3) A galeria foi gravada com uma unica foto principal.
  select count(*) into v_count from public.product_images where product_id = v_product_id;
  if v_count <> 2 then raise exception 'test_failed_images_saved'; end if;
  select count(*) into v_count
  from public.product_images where product_id = v_product_id and is_primary;
  if v_count <> 1 then raise exception 'test_failed_single_primary_image'; end if;

  -- 4) O estoque inicial entrou no livro-razao como movimentacao.
  select count(*) into v_count
  from public.inventory_movements
  where product_id = v_product_id and movement_type = 'entrada';
  if v_count <> 1 then raise exception 'test_failed_initial_stock_movement'; end if;

  -- 5) Preco vigente considera a promocao dentro da janela.
  if public.effective_price_cents(20000, 18000, null, null) <> 18000 then
    raise exception 'test_failed_promo_price_active';
  end if;
  if public.effective_price_cents(20000, 18000, now() + interval '1 day', null) <> 20000 then
    raise exception 'test_failed_promo_price_not_started';
  end if;
  if public.effective_price_cents(20000, 18000, null, now() - interval '1 day') <> 20000 then
    raise exception 'test_failed_promo_price_expired';
  end if;

  -- 6) Edicao nao mexe no saldo de estoque.
  --
  -- admin_save_product grava a ficha inteira, nao um remendo: o que nao
  -- vier em p_fields e apagado. Por isso o preco promocional e repetido
  -- aqui — e assim que o painel envia, com o formulario completo.
  perform public.admin_save_product(
    v_admin_id, v_product_id,
    jsonb_build_object(
      'slug', 'smoke-anel-teste',
      'name', 'Anel Smoke Test Editado',
      'sku', 'SMOKE-001',
      'status', 'active',
      'price_cents', 21000,
      'promo_price_cents', 18000,
      'min_stock', 2,
      'featured', false,
      'attributes', '{}'::jsonb
    ),
    '[]'::jsonb, 0
  );
  select name, stock_quantity into v_text, v_stock
  from public.products where id = v_product_id;
  if v_text <> 'Anel Smoke Test Editado' then raise exception 'test_failed_product_update'; end if;
  if v_stock <> 10 then raise exception 'test_failed_edit_changed_stock'; end if;

  -- 7) SKU duplicado e recusado.
  begin
    perform public.admin_save_product(
      v_admin_id, null,
      jsonb_build_object(
        'slug', 'smoke-outro-produto', 'name', 'Outro Produto',
        'sku', 'SMOKE-001', 'status', 'active',
        'price_cents', 5000, 'min_stock', 0, 'featured', false,
        'attributes', '{}'::jsonb
      ),
      '[]'::jsonb, 0
    );
    raise exception 'test_failed_duplicate_sku_allowed';
  exception
    when unique_violation then null;
  end;

  -- 8) Produto arquivado sai da loja, mas continua existindo.
  v_saved := public.admin_save_product(
    v_admin_id, null,
    jsonb_build_object(
      'slug', 'smoke-arquivado', 'name', 'Produto Arquivado',
      'status', 'archived', 'price_cents', 9900,
      'min_stock', 0, 'featured', false, 'attributes', '{}'::jsonb
    ),
    '[]'::jsonb, 0
  );
  v_second_id := (v_saved->>'id')::uuid;
  select active into v_bool from public.products where id = v_second_id;
  if v_bool is not false then raise exception 'test_failed_archived_still_active'; end if;

  -- 9) O booleano legado `active` continua mandando quem so escreve nele.
  update public.products set active = false where id = v_second_id;
  select status into v_text from public.products where id = v_second_id;
  if v_text <> 'archived' then raise exception 'test_failed_archived_downgraded'; end if;
  update public.products set active = true where id = v_second_id;
  select status into v_text from public.products where id = v_second_id;
  if v_text <> 'active' then raise exception 'test_failed_legacy_active_ignored'; end if;

  -- =================================================================
  -- ESTOQUE
  -- =================================================================

  -- 10) Entrada de mercadoria soma e registra saldo antes/depois.
  v_move := public.admin_move_inventory(
    v_admin_id, v_product_id, 'entrada', 5,
    'Reposicao', 'Nota fiscal de teste', 4500, 'Fornecedor Teste', v_idempotency::text
  );
  if v_move->>'state' <> 'applied' then raise exception 'test_failed_entry_state'; end if;
  if (v_move->>'quantity_after')::integer <> 15 then raise exception 'test_failed_entry_total'; end if;

  select quantity_before, quantity_after into v_count, v_stock
  from public.inventory_movements where id = (v_move->>'movement_id')::uuid;
  if v_count <> 10 or v_stock <> 15 then raise exception 'test_failed_entry_ledger_balance'; end if;

  -- 11) O mesmo envio repetido nao conta duas vezes (clique duplo).
  v_replay := public.admin_move_inventory(
    v_admin_id, v_product_id, 'entrada', 5,
    'Reposicao', 'Nota fiscal de teste', 4500, 'Fornecedor Teste', v_idempotency::text
  );
  if v_replay->>'state' <> 'duplicate' then raise exception 'test_failed_entry_not_idempotent'; end if;
  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 15 then raise exception 'test_failed_entry_duplicated_stock'; end if;

  -- 12) Saida manual desconta.
  v_move := public.admin_move_inventory(
    v_admin_id, v_product_id, 'avaria', 3, 'Peca riscada', null, null, null, null
  );
  if (v_move->>'quantity_after')::integer <> 12 then raise exception 'test_failed_manual_exit'; end if;

  -- 13) Saida maior que o estoque e recusada, sem deixar saldo negativo.
  begin
    perform public.admin_move_inventory(
      v_admin_id, v_product_id, 'perda', 999, 'Teste de limite', null, null, null, null
    );
    raise exception 'test_failed_negative_stock_allowed';
  exception
    when raise_exception then
      if sqlerrm not like '%insufficient_stock_for_movement%' then raise; end if;
  end;
  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 12 then raise exception 'test_failed_stock_changed_after_refusal'; end if;

  -- 14) Correcao de inventario ajusta para a quantidade contada.
  v_move := public.admin_move_inventory(
    v_admin_id, v_product_id, 'inventario', 4, 'Contagem da prateleira', null, null, null, null
  );
  if (v_move->>'quantity_after')::integer <> 4 then raise exception 'test_failed_inventory_count'; end if;
  if (select quantity_change from public.inventory_movements
      where id = (v_move->>'movement_id')::uuid) <> -8 then
    raise exception 'test_failed_inventory_delta';
  end if;

  -- 15) Movimentacao por quem nao e administrador e recusada.
  begin
    perform public.admin_move_inventory(
      v_client_id, v_product_id, 'entrada', 1, null, null, null, null, null
    );
    raise exception 'test_failed_non_admin_moved_stock';
  exception
    when insufficient_privilege then null;
  end;

  -- 16) O livro-razao nao aceita reescrita nem exclusao.
  begin
    update public.inventory_movements
    set quantity_change = 999
    where product_id = v_product_id;
    raise exception 'test_failed_ledger_is_mutable';
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.inventory_movements where product_id = v_product_id;
    raise exception 'test_failed_ledger_is_deletable';
  exception
    when insufficient_privilege then null;
  end;

  -- 17) Alerta de estoque baixo acompanha o minimo configurado.
  perform public.admin_move_inventory(
    v_admin_id, v_product_id, 'inventario', 2, 'Baixando para o minimo', null, null, null, null
  );
  select low_stock into v_bool from public.products where id = v_product_id;
  if v_bool is not true then raise exception 'test_failed_low_stock_flag'; end if;

  perform public.admin_move_inventory(
    v_admin_id, v_product_id, 'entrada', 8, 'Repondo para os testes de pedido', null, null, null, null
  );
  select low_stock into v_bool from public.products where id = v_product_id;
  if v_bool is not false then raise exception 'test_failed_low_stock_not_cleared'; end if;

  -- =================================================================
  -- PEDIDOS, PAGAMENTO E ESTOQUE
  -- =================================================================

  -- 18) Criar pedido reserva o estoque na hora.
  v_order := public.create_reserved_order(
    v_client_id, v_address_id,
    jsonb_build_array(jsonb_build_object('slug', 'smoke-anel-teste', 'qty', 2))
  );
  v_order_id := (v_order->>'order_id')::uuid;
  v_total := (v_order->>'total_cents')::integer;

  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 8 then raise exception 'test_failed_reservation_did_not_hold_stock'; end if;

  -- 19) O item guarda nome e preco do momento da compra (preco promocional).
  select product_name, unit_price_cents into v_text, v_count
  from public.order_items where order_id = v_order_id;
  if v_count <> 18000 then raise exception 'test_failed_item_price_not_promo'; end if;
  if v_text <> 'Anel Smoke Test Editado' then raise exception 'test_failed_item_name_snapshot'; end if;

  -- Mudar o produto depois nao pode reescrever o historico do pedido.
  perform public.admin_save_product(
    v_admin_id, v_product_id,
    jsonb_build_object(
      'slug', 'smoke-anel-teste', 'name', 'Nome Trocado Depois Da Compra',
      'sku', 'SMOKE-001', 'status', 'active', 'price_cents', 99900,
      'min_stock', 2, 'featured', false, 'attributes', '{}'::jsonb
    ),
    '[]'::jsonb, 0
  );
  select product_name, unit_price_cents into v_text, v_count
  from public.order_items where order_id = v_order_id;
  if v_count <> 18000 or v_text <> 'Anel Smoke Test Editado' then
    raise exception 'test_failed_item_snapshot_mutated';
  end if;

  -- 19b) O endereco no site de uma peca ja vendida nao pode mudar: o
  -- pedido aponta para o produto pelo slug.
  begin
    perform public.admin_save_product(
      v_admin_id, v_product_id,
      jsonb_build_object(
        'slug', 'smoke-endereco-novo', 'name', 'Anel Smoke Test Editado',
        'sku', 'SMOKE-001', 'status', 'active', 'price_cents', 21000,
        'min_stock', 2, 'featured', false, 'attributes', '{}'::jsonb
      ),
      '[]'::jsonb, 0
    );
    raise exception 'test_failed_slug_changed_after_sale';
  exception
    when raise_exception then
      if sqlerrm not like '%slug_locked_by_orders%' then raise; end if;
  end;

  -- 19c) Busca do painel: numero curto do pedido e e-mail da cliente.
  select count(*) into v_count
  from public.admin_find_order_ids(left(v_order_id::text, 8))
  where order_id = v_order_id;
  if v_count <> 1 then raise exception 'test_failed_order_prefix_search'; end if;

  select count(*) into v_count
  from public.admin_find_user_ids('cliente.smoke@druza.test')
  where user_id = v_client_id;
  if v_count <> 1 then raise exception 'test_failed_customer_email_search'; end if;

  -- Curinga do `like` precisa ser escapado: sem isso, '%%' viraria o
  -- padrao '%%%%' e devolveria a base inteira.
  select count(*) into v_count from public.admin_find_user_ids('%%');
  if v_count <> 0 then raise exception 'test_failed_search_wildcard_not_escaped'; end if;
  select count(*) into v_count from public.admin_find_user_ids('_liente.smoke');
  if v_count <> 0 then raise exception 'test_failed_search_underscore_not_escaped'; end if;

  -- 20) O retrato de estoque separa disponivel, reservado e fisico.
  select available, reserved, physical into v_stock, v_reserved, v_physical
  from public.product_stock_snapshot() where slug = 'smoke-anel-teste';
  if v_stock <> 8 or v_reserved <> 2 or v_physical <> 10 then
    raise exception 'test_failed_stock_snapshot';
  end if;

  -- 21) Pagamento aprovado baixa o estoque exatamente uma vez.
  v_applied := public.apply_payment_event(
    repeat('a', 64), 'webhook', v_order_id, '900000001', 'approved',
    v_total, v_order_id::text, now(), null
  );
  if v_applied->>'state' <> 'applied' then raise exception 'test_failed_payment_not_applied'; end if;
  if v_applied->>'order_status' <> 'paid' then raise exception 'test_failed_order_not_paid'; end if;

  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 8 then raise exception 'test_failed_double_deduction_on_payment'; end if;

  -- 22) Webhook repetido nao desconta de novo.
  v_duplicate := public.apply_payment_event(
    repeat('a', 64), 'webhook', v_order_id, '900000001', 'approved',
    v_total, v_order_id::text, now(), null
  );
  if v_duplicate->>'state' <> 'duplicate' then raise exception 'test_failed_webhook_not_idempotent'; end if;
  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 8 then raise exception 'test_failed_duplicate_webhook_changed_stock'; end if;

  select count(*) into v_count
  from public.inventory_movements
  where order_id = v_order_id and movement_type = 'venda';
  if v_count <> 1 then raise exception 'test_failed_more_than_one_sale_movement'; end if;

  -- 23) Rastreio e etapas de envio entram na linha do tempo.
  update public.orders
  set tracking_code = 'AA123456789BR', shipping_carrier = 'Correios'
  where id = v_order_id;
  update public.orders set status = 'shipped' where id = v_order_id;

  select posted_at is not null into v_bool from public.orders where id = v_order_id;
  if v_bool is not true then raise exception 'test_failed_posted_at_not_stamped'; end if;

  select count(*) into v_count
  from public.order_status_history
  where order_id = v_order_id and event_type = 'rastreio_adicionado';
  if v_count <> 1 then raise exception 'test_failed_tracking_history'; end if;

  select count(*) into v_count
  from public.order_status_history
  where order_id = v_order_id and event_type = 'status_alterado' and to_status = 'shipped';
  if v_count <> 1 then raise exception 'test_failed_status_history'; end if;

  -- 24) Pedido recusado devolve o estoque reservado, uma vez so.
  v_order := public.create_reserved_order(
    v_client_id, v_address_id,
    jsonb_build_array(jsonb_build_object('slug', 'smoke-anel-teste', 'qty', 3))
  );
  v_cancel_order_id := (v_order->>'order_id')::uuid;
  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 5 then raise exception 'test_failed_second_reservation'; end if;

  perform public.apply_payment_event(
    repeat('b', 64), 'webhook', v_cancel_order_id, '900000002', 'rejected',
    (v_order->>'total_cents')::integer, v_cancel_order_id::text, now(), null
  );
  select status into v_text from public.orders where id = v_cancel_order_id;
  if v_text <> 'canceled' then raise exception 'test_failed_rejected_not_canceled'; end if;
  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 8 then raise exception 'test_failed_reservation_not_released'; end if;

  -- Segunda liberacao do mesmo pedido nao pode devolver estoque de novo.
  if private.release_order_reservation(v_cancel_order_id) then
    raise exception 'test_failed_release_ran_twice';
  end if;
  select stock_quantity into v_stock from public.products where id = v_product_id;
  if v_stock <> 8 then raise exception 'test_failed_double_release_inflated_stock'; end if;

  -- 25) Nao e possivel vender mais do que existe.
  -- Esta e a mesma checagem que protege duas clientes disputando a ultima
  -- peca: create_reserved_order trava a linha do produto com FOR UPDATE
  -- antes de comparar o saldo, entao a segunda transacao so avalia o
  -- estoque depois que a primeira terminou.
  begin
    perform public.create_reserved_order(
      v_client_id, v_address_id,
      jsonb_build_array(jsonb_build_object('slug', 'smoke-anel-teste', 'qty', 9))
    );
    raise exception 'test_failed_oversell_allowed';
  exception
    when raise_exception then
      if sqlerrm not like '%insufficient_stock%' then raise; end if;
  end;

  -- 26) Produto fora da loja nao pode ser comprado.
  update public.products set status = 'inactive' where id = v_product_id;
  begin
    perform public.create_reserved_order(
      v_client_id, v_address_id,
      jsonb_build_array(jsonb_build_object('slug', 'smoke-anel-teste', 'qty', 1))
    );
    raise exception 'test_failed_inactive_product_sold';
  exception
    when raise_exception then
      if sqlerrm not like '%inactive_product%' then raise; end if;
  end;
  update public.products set status = 'active' where id = v_product_id;

  -- =================================================================
  -- PERMISSOES
  -- =================================================================

  -- 27) Nenhuma SECURITY DEFINER publica fica ao alcance do cliente.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'test_failed_security_definer_exposed_to_client';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'test_failed_private_function_exposed_to_client';
  end if;

  -- 28) O navegador nao alcanca estoque, auditoria nem linha do tempo.
  if has_table_privilege('anon', 'public.inventory_movements', 'SELECT')
     or has_table_privilege('authenticated', 'public.inventory_movements', 'SELECT') then
    raise exception 'test_failed_ledger_readable_by_client';
  end if;
  if has_table_privilege('authenticated', 'public.order_status_history', 'SELECT') then
    raise exception 'test_failed_history_readable_by_client';
  end if;
  if has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT') then
    raise exception 'test_failed_audit_readable_by_client';
  end if;

  -- 29) Custo e margem nao saem para a vitrine.
  if has_column_privilege('anon', 'public.products', 'cost_cents', 'SELECT')
     or has_column_privilege('authenticated', 'public.products', 'cost_cents', 'SELECT') then
    raise exception 'test_failed_cost_exposed_to_client';
  end if;

  -- 30) Nenhuma escrita de catalogo pelo cliente.
  if has_table_privilege('authenticated', 'public.products', 'UPDATE')
     or has_table_privilege('authenticated', 'public.products', 'INSERT')
     or has_table_privilege('authenticated', 'public.categories', 'UPDATE')
     or has_table_privilege('authenticated', 'public.product_images', 'INSERT') then
    raise exception 'test_failed_client_can_write_catalog';
  end if;

  -- 31) A vitrine continua conseguindo ler o que precisa.
  if not has_column_privilege('anon', 'public.products', 'price_cents', 'SELECT')
     or not has_table_privilege('anon', 'public.categories', 'SELECT')
     or not has_table_privilege('anon', 'public.product_images', 'SELECT') then
    raise exception 'test_failed_storefront_cannot_read_catalog';
  end if;

  if not has_function_privilege(
    'anon',
    'public.effective_price_cents(integer,integer,timestamptz,timestamptz)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.effective_price_cents(integer,integer,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'test_failed_storefront_price_function_unavailable';
  end if;

  raise notice 'smoke test completo: catalogo, estoque, pedidos e permissoes OK';
end $$;

rollback;

/* =====================================================================
   DRUZA — admin.js
   Camada de acesso ao painel administrativo. Requer, ANTES deste script:
     <script src="js/config.public.js"></script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.js" integrity="..." crossorigin="anonymous"></script>
     <script src="js/auth.js"></script>
   Expõe window.DruzaAdmin.
   ===================================================================== */
(function () {
  'use strict';

  const A = window.DruzaAuth;

  // Confere se o usuário logado está na tabela admins (RLS admins_select_own).
  // Isto é só o gate da UI — a segurança de verdade é revalidada de novo
  // dentro de cada Edge Function admin-* (nunca confiamos só nisto).
  async function checkAccess() {
    if (!A || !A.client) return false;
    const user = await A.getUser();
    if (!user) return false;
    const { data, error } = await A.client
      .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error) return false;
    return !!data;
  }

  // ------------------------------------------------------------------
  // 2FA (MFA TOTP nativo do Supabase). aal2 = código verificado nesta
  // sessão. A trava real é no servidor (require-admin exige aal2); aqui
  // é só para a UI conduzir o enrolamento e o desafio.
  // ------------------------------------------------------------------
  async function getAAL() {
    if (!A || !A.client) return { current: null, next: null };
    const { data } = await A.client.auth.mfa.getAuthenticatorAssuranceLevel();
    return { current: (data && data.currentLevel) || null, next: (data && data.nextLevel) || null };
  }

  async function listFactors() {
    if (!A || !A.client) return [];
    const { data } = await A.client.auth.mfa.listFactors();
    // Só fatores TOTP verificados interessam para o desafio de login.
    return (data && data.totp) || [];
  }

  // Inicia o enrolamento de um novo fator TOTP. Retorna o QR (SVG data
  // URI), o segredo textual (fallback para digitar no app) e o factorId.
  async function enroll() {
    if (!A || !A.client) return { error: 'Configuração ausente.' };
    const { data, error } = await A.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Druza Admin ' + Date.now(),
    });
    if (error) return { error: error.message };
    return {
      factorId: data.id,
      qr: data.totp && data.totp.qr_code,
      secret: data.totp && data.totp.secret,
      uri: data.totp && data.totp.uri,
    };
  }

  // Verifica um código de 6 dígitos contra um fator (challenge + verify).
  // Serve tanto para confirmar o enrolamento quanto para o login diário.
  // Em sucesso, a sessão sobe para aal2.
  async function verifyFactor(factorId, code) {
    if (!A || !A.client) return { error: 'Configuração ausente.' };
    const ch = await A.client.auth.mfa.challenge({ factorId: factorId });
    if (ch.error) return { error: ch.error.message };
    const { error } = await A.client.auth.mfa.verify({
      factorId: factorId,
      challengeId: ch.data.id,
      code: String(code || '').trim(),
    });
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function unenroll(factorId) {
    if (!A || !A.client) return { error: 'Configuração ausente.' };
    const { error } = await A.client.auth.mfa.unenroll({ factorId: factorId });
    return error ? { error: error.message } : { ok: true };
  }

  // ------------------------------------------------------------------
  // Chamadas do painel. Cada uma é uma Edge Function que revalida
  // admin + 2FA no servidor — esconder um botão aqui nunca é a trava.
  // ------------------------------------------------------------------
  async function listOrders(filters) {
    return A.invokeFunction('admin-list-orders', filters || {});
  }
  async function getOrder(orderId) {
    return A.invokeFunction('admin-get-order', { order_id: orderId });
  }
  async function updateOrder(fields) {
    return A.invokeFunction('admin-update-order', fields);
  }
  async function listProducts(filters) {
    return A.invokeFunction('admin-list-products', filters || {});
  }
  async function upsertProduct(fields) {
    return A.invokeFunction('admin-upsert-product', fields);
  }
  async function setProductStatus(id, status) {
    return A.invokeFunction('admin-delete-product', { id: id, status: status });
  }
  async function dashboard() {
    return A.invokeFunction('admin-dashboard', {});
  }
  async function listCategories() {
    return A.invokeFunction('admin-list-categories', {});
  }
  async function upsertCategory(fields) {
    return A.invokeFunction('admin-upsert-category', fields);
  }
  async function deleteCategory(id, moveToCategoryId) {
    return A.invokeFunction('admin-delete-category', {
      id: id, move_to_category_id: moveToCategoryId || null
    });
  }
  async function moveInventory(fields) {
    return A.invokeFunction('admin-inventory-move', fields);
  }
  async function listInventory(filters) {
    return A.invokeFunction('admin-list-inventory', filters || {});
  }
  async function listCustomers(filters) {
    return A.invokeFunction('admin-list-customers', filters || {});
  }
  async function listAudit(filters) {
    return A.invokeFunction('admin-list-audit', filters || {});
  }

  // ------------------------------------------------------------------
  // Upload de foto de produto.
  //
  // Vai direto do navegador para o Storage com o JWT da administradora;
  // quem libera a escrita é a policy do bucket (só quem está em
  // public.admins). A service_role nunca chega ao navegador.
  // ------------------------------------------------------------------
  const IMAGE_BUCKET = 'product-images';
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  async function uploadProductImage(file, slug) {
    if (!A || !A.client) return { error: 'Configuração ausente.' };
    if (!file) return { error: 'Escolha uma foto.' };
    if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
      return { error: 'Formato não aceito. Use JPG, PNG, WebP ou AVIF.' };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: 'A foto tem mais de 5 MB. Reduza o tamanho e tente de novo.' };
    }

    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeSlug = String(slug || 'produto').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'produto';
    const path = safeSlug + '/' + Date.now() + '-' +
      Math.random().toString(36).slice(2, 8) + '.' + (extension || 'jpg');

    const { error } = await A.client.storage.from(IMAGE_BUCKET).upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });
    if (error) return { error: 'Não foi possível enviar a foto. Tente novamente.' };

    const { data } = A.client.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return { url: (data && data.publicUrl) || null, path: path };
  }

  window.DruzaAdmin = {
    checkAccess,
    getAAL, listFactors, enroll, verifyFactor, unenroll,
    listOrders, getOrder, updateOrder,
    listProducts, upsertProduct, setProductStatus,
    dashboard,
    listCategories, upsertCategory, deleteCategory,
    moveInventory, listInventory,
    listCustomers, listAudit,
    uploadProductImage
  };
})();

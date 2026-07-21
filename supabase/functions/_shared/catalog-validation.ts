// deno-lint-ignore-file no-control-regex
// As duas unicas expressoes com caracteres de controle neste arquivo
// existem justamente para remove-los do texto digitado no painel.
// =====================================================================
// DRUZA — _shared/catalog-validation.ts
//
// Normalizacao e validacao dos dados de catalogo e estoque que chegam do
// painel. Modulo puro, sem I/O e sem dependencia externa: o que sai
// daqui e exatamente o conjunto de colunas que pode ser gravado.
//
// Isso tambem e a defesa contra mass assignment. As funcoes montam o
// objeto campo a campo a partir de uma lista fechada; nada do corpo da
// requisicao chega ao banco sem passar por um `case` explicito aqui.
// =====================================================================

import { AdminRequestError } from './http-error.ts';

export const PRODUCT_STATUSES = ['active', 'inactive', 'archived'] as const;
export type ProductStatus = typeof PRODUCT_STATUSES[number];

export const MANUAL_MOVEMENT_TYPES = [
  'entrada',
  'devolucao',
  'troca',
  'ajuste_positivo',
  'ajuste_negativo',
  'perda',
  'avaria',
  'inventario',
] as const;
export type ManualMovementType = typeof MANUAL_MOVEMENT_TYPES[number];

const MAX_PRICE_CENTS = 100_000_000;
const MAX_STOCK = 100_000;

// Ficha tecnica da semijoia. Chave = coluna dentro de products.attributes.
// Manter a lista aqui (e nao no formulario) garante que um campo novo no
// HTML sem contrapartida aqui simplesmente nao e gravado, em vez de
// virar chave livre no jsonb.
export const PRODUCT_ATTRIBUTES: Record<string, { kind: 'text' | 'boolean'; max?: number }> = {
  tipo_peca:      { kind: 'text', max: 60 },
  material:       { kind: 'text', max: 60 },
  banho:          { kind: 'text', max: 60 },
  cor:            { kind: 'text', max: 40 },
  pedra:          { kind: 'text', max: 60 },
  dimensoes:      { kind: 'text', max: 80 },
  comprimento:    { kind: 'text', max: 40 },
  peso:           { kind: 'text', max: 40 },
  tamanho:        { kind: 'text', max: 60 },
  acabamento:     { kind: 'text', max: 60 },
  conservacao:    { kind: 'text', max: 600 },
  garantia:       { kind: 'text', max: 200 },
  observacoes:    { kind: 'text', max: 600 },
  ajustavel:      { kind: 'boolean' },
  hipoalergenico: { kind: 'boolean' },
  sem_niquel:     { kind: 'boolean' },
};

// ---------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------
export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

// Preserva quebras de linha (descricao longa, instrucoes de conservacao)
// mas continua removendo caracteres de controle.
export function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function normalizeSlug(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length >= 2 && value.length <= 60;
}

export function normalizeSku(value: unknown): string | null {
  const sku = String(value ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 40);
  if (!sku) return null;
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(sku)) {
    throw new AdminRequestError('O código interno (SKU) deve ter de 2 a 40 letras, números, ponto, hífen ou sublinhado.');
  }
  return sku;
}

export function parseCents(value: unknown, label: string, required = false): number | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AdminRequestError(`Informe ${label}.`);
    return null;
  }
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_PRICE_CENTS) {
    throw new AdminRequestError(`O valor de ${label} não é válido.`);
  }
  return cents;
}

export function parseTimestamp(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) {
    throw new AdminRequestError(`A data de ${label} não é válida.`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new AdminRequestError(`A data de ${label} não é válida.`);
  }
  return new Date(time).toISOString();
}

export function parseAttributes(value: unknown): Record<string, string | boolean> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminRequestError('As características do produto não são válidas.');
  }
  const input = value as Record<string, unknown>;
  const result: Record<string, string | boolean> = {};

  for (const [key, spec] of Object.entries(PRODUCT_ATTRIBUTES)) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') continue;

    if (spec.kind === 'boolean') {
      if (raw === true || raw === 'true') result[key] = true;
      else if (raw === false || raw === 'false') result[key] = false;
      continue;
    }

    const text = cleanMultiline(raw, spec.max ?? 120);
    if (text) result[key] = text;
  }
  return result;
}

export function parseTags(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value)
    ? value
    : String(value).split(',');
  const tags: string[] = [];
  for (const raw of list) {
    const tag = cleanText(raw, 30).toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= 20) break;
  }
  return tags;
}

// ---------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------
export interface ProductFields {
  slug: string;
  name: string;
  sku: string | null;
  status: ProductStatus;
  category_id: string | null;
  collection: string | null;
  tags: string[];
  short_description: string | null;
  long_description: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  promo_price_cents: number | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
  cost_cents: number | null;
  min_stock: number;
  featured: boolean;
  attributes: Record<string, string | boolean>;
  seo_title: string | null;
  seo_description: string | null;
}

export function parseProductInput(body: Record<string, unknown>): ProductFields {
  const name = cleanText(body.name, 120);
  if (name.length < 2) {
    throw new AdminRequestError('Informe o nome do produto (pelo menos 2 letras).');
  }

  const slug = body.slug ? normalizeSlug(body.slug) : normalizeSlug(name);
  if (!isValidSlug(slug)) {
    throw new AdminRequestError('O endereço do produto no site (slug) não é válido.');
  }

  const status = String(body.status ?? 'active') as ProductStatus;
  if (!PRODUCT_STATUSES.includes(status)) {
    throw new AdminRequestError('Situação do produto inválida.');
  }

  if (body.category_id !== undefined && body.category_id !== null && body.category_id !== ''
      && !isUuid(body.category_id)) {
    throw new AdminRequestError('Categoria inválida.');
  }

  const priceCents = parseCents(body.price_cents, 'o preço de venda', true) as number;
  const promoCents = parseCents(body.promo_price_cents, 'o preço promocional');
  const compareCents = parseCents(body.compare_at_price_cents, 'o preço anterior');

  if (promoCents !== null && promoCents >= priceCents) {
    throw new AdminRequestError('O preço promocional precisa ser menor que o preço de venda.');
  }
  if (compareCents !== null && compareCents < priceCents) {
    throw new AdminRequestError('O preço anterior precisa ser maior que o preço de venda.');
  }

  const promoStartsAt = parseTimestamp(body.promo_starts_at, 'início da promoção');
  const promoEndsAt = parseTimestamp(body.promo_ends_at, 'fim da promoção');
  if (promoStartsAt && promoEndsAt && Date.parse(promoEndsAt) <= Date.parse(promoStartsAt)) {
    throw new AdminRequestError('A promoção precisa terminar depois de começar.');
  }
  if (promoCents !== null && !promoStartsAt && !promoEndsAt) {
    // Promocao sem janela vale desde ja e ate segunda ordem — decisao
    // consciente, para nao obrigar a usuaria a preencher duas datas.
  }

  const minStock = body.min_stock === undefined || body.min_stock === null || body.min_stock === ''
    ? 0
    : Number(body.min_stock);
  if (!Number.isInteger(minStock) || minStock < 0 || minStock > MAX_STOCK) {
    throw new AdminRequestError('O estoque mínimo precisa ser um número inteiro entre 0 e 100000.');
  }

  return {
    slug,
    name,
    sku: normalizeSku(body.sku),
    status,
    category_id: isUuid(body.category_id) ? body.category_id : null,
    collection: cleanText(body.collection, 60) || null,
    tags: parseTags(body.tags),
    short_description: cleanText(body.short_description, 280) || null,
    long_description: cleanMultiline(body.long_description, 4000) || null,
    price_cents: priceCents,
    compare_at_price_cents: compareCents,
    promo_price_cents: promoCents,
    promo_starts_at: promoStartsAt,
    promo_ends_at: promoEndsAt,
    cost_cents: parseCents(body.cost_cents, 'o custo do produto'),
    min_stock: minStock,
    featured: body.featured === true,
    attributes: parseAttributes(body.attributes),
    seo_title: cleanText(body.seo_title, 70) || null,
    seo_description: cleanText(body.seo_description, 180) || null,
  };
}

export function parseInitialStock(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < 0 || qty > MAX_STOCK) {
    throw new AdminRequestError('A quantidade inicial precisa ser um número inteiro entre 0 e 100000.');
  }
  return qty;
}

// ---------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------
export interface ImageInput {
  url: string;
  alt: string | null;
  position: number;
  is_primary: boolean;
}

// So aceita caminho dentro do bucket publico do proprio projeto ou URL
// https. Bloqueia `javascript:`, `data:` e host de terceiros escolhido
// pelo corpo da requisicao.
export function parseImages(value: unknown, allowedHost: string): ImageInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new AdminRequestError('A lista de fotos não é válida.');
  }
  if (value.length > 12) {
    throw new AdminRequestError('São aceitas no máximo 12 fotos por produto.');
  }

  const images: ImageInput[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AdminRequestError('A lista de fotos não é válida.');
    }
    const item = raw as Record<string, unknown>;
    const url = cleanText(item.url, 600);
    if (!url) return;

    const isRelative = /^img\/[A-Za-z0-9._\-\/]+$/.test(url);
    let isAllowedAbsolute = false;
    if (!isRelative) {
      try {
        const parsed = new URL(url);
        isAllowedAbsolute = parsed.protocol === 'https:'
          && (!allowedHost || parsed.host === allowedHost);
      } catch {
        isAllowedAbsolute = false;
      }
    }
    if (!isRelative && !isAllowedAbsolute) {
      throw new AdminRequestError('Uma das fotos tem endereço inválido. Envie a foto pelo próprio painel.');
    }

    images.push({
      url,
      alt: cleanText(item.alt, 160) || null,
      position: Number.isInteger(item.position) ? Math.min(Math.max(item.position as number, 0), 50) : index,
      is_primary: item.is_primary === true,
    });
  });

  if (images.length && !images.some((image) => image.is_primary)) {
    images[0].is_primary = true;
  }
  // Uma unica principal, mesmo que o formulario mande duas marcadas.
  let seenPrimary = false;
  for (const image of images) {
    if (image.is_primary && seenPrimary) image.is_primary = false;
    else if (image.is_primary) seenPrimary = true;
  }
  return images;
}

// ---------------------------------------------------------------------
// Categoria
// ---------------------------------------------------------------------
export interface CategoryFields {
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  seo_title: string | null;
  seo_description: string | null;
}

export function parseCategoryInput(body: Record<string, unknown>): CategoryFields {
  const name = cleanText(body.name, 80);
  if (name.length < 2) {
    throw new AdminRequestError('Informe o nome da categoria (pelo menos 2 letras).');
  }

  const slug = body.slug ? normalizeSlug(body.slug) : normalizeSlug(name);
  if (!isValidSlug(slug)) {
    throw new AdminRequestError('O endereço da categoria no site (slug) não é válido.');
  }

  if (body.parent_id !== undefined && body.parent_id !== null && body.parent_id !== ''
      && !isUuid(body.parent_id)) {
    throw new AdminRequestError('Categoria superior inválida.');
  }

  const sortOrder = body.sort_order === undefined || body.sort_order === null || body.sort_order === ''
    ? 0
    : Number(body.sort_order);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
    throw new AdminRequestError('A ordem de exibição precisa ser um número entre 0 e 10000.');
  }

  return {
    slug,
    name,
    description: cleanMultiline(body.description, 600) || null,
    image_url: cleanText(body.image_url, 600) || null,
    parent_id: isUuid(body.parent_id) ? body.parent_id : null,
    sort_order: sortOrder,
    active: body.active !== false,
    seo_title: cleanText(body.seo_title, 70) || null,
    seo_description: cleanText(body.seo_description, 180) || null,
  };
}

// ---------------------------------------------------------------------
// Movimentacao de estoque
// ---------------------------------------------------------------------
export interface InventoryMoveFields {
  product_id: string;
  movement_type: ManualMovementType;
  quantity: number;
  reason: string | null;
  note: string | null;
  unit_cost_cents: number | null;
  supplier: string | null;
  idempotency_key: string | null;
}

export function parseInventoryMove(body: Record<string, unknown>): InventoryMoveFields {
  if (!isUuid(body.product_id)) {
    throw new AdminRequestError('Selecione um produto válido.');
  }

  const movementType = String(body.movement_type ?? '') as ManualMovementType;
  if (!MANUAL_MOVEMENT_TYPES.includes(movementType)) {
    throw new AdminRequestError('Tipo de movimentação inválido.');
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STOCK) {
    throw new AdminRequestError('A quantidade precisa ser um número inteiro entre 0 e 100000.');
  }
  if (quantity === 0 && movementType !== 'inventario') {
    throw new AdminRequestError('A quantidade precisa ser maior que zero.');
  }

  // Saida sem justificativa vira estoque que sumiu sem explicacao tres
  // meses depois. Para tudo que reduz o saldo, o motivo e obrigatorio.
  const reducesStock = ['ajuste_negativo', 'perda', 'avaria'].includes(movementType);
  const reason = cleanText(body.reason, 120);
  if (reducesStock && !reason) {
    throw new AdminRequestError('Explique o motivo da saída para manter o histórico confiável.');
  }

  return {
    product_id: body.product_id as string,
    movement_type: movementType,
    quantity,
    reason: reason || null,
    note: cleanMultiline(body.note, 500) || null,
    unit_cost_cents: parseCents(body.unit_cost_cents, 'o custo unitário'),
    supplier: cleanText(body.supplier, 120) || null,
    idempotency_key: isUuid(body.idempotency_key) ? body.idempotency_key : null,
  };
}

export const RECONCILE_AUTH_VERSION = 'v1';
export const RECONCILE_AUTH_PATH = '/functions/v1/reconcile-stale-payments';
export const RECONCILE_AUTH_MAX_BODY_BYTES = 1024;
export const RECONCILE_AUTH_SKEW_MS = 120_000;

// O gateway pode entregar a mesma rota publica ao runtime com o prefixo
// removido. A assinatura continua sempre vinculada ao caminho publico canonico;
// somente estes aliases exatos de execucao sao aceitos.
const RECONCILE_RUNTIME_PATHS = new Set([
  RECONCILE_AUTH_PATH,
  '/reconcile-stale-payments',
  '/',
]);

const SECRET_HEX_RE = /^[0-9a-f]{64}$/;
const SIGNATURE_RE = /^v1=([0-9a-f]{64})$/;
const TIMESTAMP_RE = /^[0-9]{1,10}$/;
const JSON_CONTENT_TYPE_RE = /^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i;

export type ReconcileAuthFailure =
  | { ok: false; status: 400; code: 'invalid_request' }
  | { ok: false; status: 401; code: 'unauthorized' }
  | { ok: false; status: 503; code: 'hmac_unavailable' };

export interface ReconcileAuthSuccess {
  ok: true;
  bodyText: '{}';
  matchedSecret: 'current' | 'previous';
  version: typeof RECONCILE_AUTH_VERSION;
}

export type ReconcileAuthResult = ReconcileAuthFailure | ReconcileAuthSuccess;

export interface AuthenticateReconcileRequestOptions {
  currentSecret?: string;
  previousSecret?: string;
  nowMs?: number;
}

const encoder = new TextEncoder();

export function parseReconcileSecretHex(secret: string): Uint8Array {
  if (!SECRET_HEX_RE.test(secret)) throw new Error('invalid_secret');
  return hexToBytes(secret);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function buildCanonicalReconcileMessage(
  parts: {
    timestamp: string;
    method: string;
    path: string;
    bodySha256Hex: string;
  },
): string {
  return [
    RECONCILE_AUTH_VERSION,
    parts.timestamp,
    parts.method,
    parts.path,
    parts.bodySha256Hex,
  ].join('\n');
}

export function constantTimeDigestEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== 32 || right.length !== 32) return false;
  let diff = 0;
  for (let index = 0; index < 32; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

export async function authenticateReconcileRequest(
  request: Request,
  options: AuthenticateReconcileRequestOptions,
): Promise<ReconcileAuthResult> {
  const currentSecret = parseSecretOrFail(options.currentSecret);
  if (!currentSecret.ok) return currentSecret;

  const previousSecret = parseOptionalPreviousSecretOrFail(options.previousSecret);
  if (!previousSecret.ok) return previousSecret;

  if (!isAllowedJsonContentType(request.headers.get('content-type'))) {
    return invalidRequest();
  }

  const url = new URL(request.url);
  if (url.search || request.url.includes('?')) return invalidRequest();
  if (!RECONCILE_RUNTIME_PATHS.has(url.pathname)) return unauthorized();

  const timestamp = parseTimestampHeader(
    request.headers.get('x-druza-timestamp'),
    options.nowMs ?? Date.now(),
  );
  if (!timestamp.ok) return timestamp;

  const signature = parseSignatureHeader(request.headers.get('x-druza-signature'));
  if (!signature.ok) return signature;

  if (request.method !== 'POST') return unauthorized();

  const body = await parseCanonicalBody(request);
  if (!body.ok) return body;

  const bodySha256Hex = await sha256Hex(body.bodyText);
  const message = buildCanonicalReconcileMessage({
    timestamp: timestamp.timestamp,
    method: request.method,
    path: RECONCILE_AUTH_PATH,
    bodySha256Hex,
  });

  const providedDigest = hexToBytes(signature.digestHex);
  const currentDigest = await signMessage(currentSecret.secretBytes, message);
  const previousDigest = previousSecret.secretBytes
    ? await signMessage(previousSecret.secretBytes, message)
    : null;

  const currentMatches = constantTimeDigestEquals(currentDigest, providedDigest);
  const previousMatches = previousDigest
    ? constantTimeDigestEquals(previousDigest, providedDigest)
    : false;

  if (!currentMatches && !previousMatches) return unauthorized();

  return {
    ok: true,
    bodyText: '{}',
    matchedSecret: currentMatches ? 'current' : 'previous',
    version: RECONCILE_AUTH_VERSION,
  };
}

function parseSecretOrFail(secret: string | undefined):
  | { ok: true; secretBytes: Uint8Array }
  | ReconcileAuthFailure {
  if (!secret) return unavailable();
  try {
    return { ok: true, secretBytes: parseReconcileSecretHex(secret) };
  } catch {
    return unavailable();
  }
}

function parseOptionalPreviousSecretOrFail(secret: string | undefined):
  | { ok: true; secretBytes: Uint8Array | null }
  | ReconcileAuthFailure {
  if (secret === undefined || secret === '') return { ok: true, secretBytes: null };
  try {
    return { ok: true, secretBytes: parseReconcileSecretHex(secret) };
  } catch {
    return unavailable();
  }
}

function parseTimestampHeader(value: string | null, nowMs: number):
  | { ok: true; timestamp: string }
  | ReconcileAuthFailure {
  if (!value || value.includes(',') || !TIMESTAMP_RE.test(value)) {
    return invalidRequest();
  }

  const timestampSeconds = Number(value);
  if (!Number.isSafeInteger(timestampSeconds)) return invalidRequest();

  const requestMs = timestampSeconds * 1000;
  if (Math.abs(nowMs - requestMs) > RECONCILE_AUTH_SKEW_MS) {
    return unauthorized();
  }
  return { ok: true, timestamp: value };
}

function parseSignatureHeader(value: string | null):
  | { ok: true; digestHex: string }
  | ReconcileAuthFailure {
  if (!value || value.includes(',')) return invalidRequest();
  const match = value.match(SIGNATURE_RE);
  if (!match) return invalidRequest();
  return { ok: true, digestHex: match[1] };
}

async function parseCanonicalBody(request: Request):
  Promise<{ ok: true; bodyText: '{}' } | ReconcileAuthFailure> {
  const text = await readBodyTextWithinLimit(request);
  if (text === null) return invalidRequest();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return invalidRequest();
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return invalidRequest();
  }
  if (Object.keys(payload as Record<string, unknown>).length !== 0) {
    return invalidRequest();
  }
  return { ok: true, bodyText: '{}' };
}

async function readBodyTextWithinLimit(request: Request): Promise<string | null> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > RECONCILE_AUTH_MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes);
  } catch {
    return null;
  }
}

function isAllowedJsonContentType(value: string | null): boolean {
  if (!value) return false;
  return JSON_CONTENT_TYPE_RE.test(value.trim());
}

async function signMessage(secretBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return new Uint8Array(signature);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function invalidRequest(): ReconcileAuthFailure {
  return { ok: false, status: 400, code: 'invalid_request' };
}

function unauthorized(): ReconcileAuthFailure {
  return { ok: false, status: 401, code: 'unauthorized' };
}

function unavailable(): ReconcileAuthFailure {
  return { ok: false, status: 503, code: 'hmac_unavailable' };
}

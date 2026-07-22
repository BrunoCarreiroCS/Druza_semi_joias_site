import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  authenticateReconcileRequest,
  buildCanonicalReconcileMessage,
  constantTimeDigestEquals,
  parseReconcileSecretHex,
  RECONCILE_AUTH_MAX_BODY_BYTES,
  RECONCILE_AUTH_PATH,
  RECONCILE_AUTH_SKEW_MS,
  RECONCILE_AUTH_VERSION,
  sha256Hex,
} from './reconcile-auth.ts';

const FIXTURE_SECRET_CURRENT =
  '00112233445566778899aabbccddeefffedcba98765432100123456789abcdef';
const FIXTURE_SECRET_PREVIOUS =
  'abcdef0123456789fedcba987654321000112233445566778899aabbccddeeff';
const FIXTURE_TIMESTAMP = '1764201600';
const FIXTURE_NOW_MS = Number(FIXTURE_TIMESTAMP) * 1000;
const FIXTURE_BODY_HASH =
  '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
const FIXTURE_SIGNATURE_CURRENT =
  '3e94d28afeebc0e759e3d4f26038d1fd3b54e1246e3c883fd39e61354bb2f1fd';
const FIXTURE_SIGNATURE_PREVIOUS =
  '64649264f7498540f62fa3a79aa7c9fbdc74725828069230fed18f0358ae0570';
const FIXTURE_SIGNATURE_HEADER_CURRENT = `v1=${FIXTURE_SIGNATURE_CURRENT}`;
const FIXTURE_SIGNATURE_HEADER_PREVIOUS = `v1=${FIXTURE_SIGNATURE_PREVIOUS}`;
const FIXTURE_MESSAGE =
  `v1\n${FIXTURE_TIMESTAMP}\nPOST\n${RECONCILE_AUTH_PATH}\n${FIXTURE_BODY_HASH}`;

function buildRequest(
  body: string,
  headers: Record<string, string> = {},
  init: { method?: string; path?: string } = {},
): Request {
  const url = new URL(`https://example.com${init.path ?? RECONCILE_AUTH_PATH}`);
  const method = init.method ?? 'POST';
  return new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

async function expectAuthFailure(
  request: Request,
  opts: {
    currentSecret?: string;
    previousSecret?: string;
    nowMs?: number;
  } = {},
): Promise<Exclude<Awaited<ReturnType<typeof authenticateReconcileRequest>>, { ok: true }>> {
  const result = await authenticateReconcileRequest(request, {
    currentSecret: Object.hasOwn(opts, 'currentSecret')
      ? opts.currentSecret
      : FIXTURE_SECRET_CURRENT,
    previousSecret: opts.previousSecret,
    nowMs: opts.nowMs ?? FIXTURE_NOW_MS,
  });
  assert.equal(result.ok, false);
  return result;
}

test('fixture vector stays stable for digest and HMAC', async () => {
  assert.equal(RECONCILE_AUTH_VERSION, 'v1');
  assert.equal(RECONCILE_AUTH_PATH, '/functions/v1/reconcile-stale-payments');
  assert.equal(RECONCILE_AUTH_MAX_BODY_BYTES, 1024);
  assert.equal(RECONCILE_AUTH_SKEW_MS, 120_000);
  assert.equal(await sha256Hex('{}'), FIXTURE_BODY_HASH);
  assert.equal(
    buildCanonicalReconcileMessage({
      timestamp: FIXTURE_TIMESTAMP,
      method: 'POST',
      path: RECONCILE_AUTH_PATH,
      bodySha256Hex: FIXTURE_BODY_HASH,
    }),
    FIXTURE_MESSAGE,
  );
  const current = parseReconcileSecretHex(FIXTURE_SECRET_CURRENT);
  const previous = parseReconcileSecretHex(FIXTURE_SECRET_PREVIOUS);
  assert.equal(current.length, 32);
  assert.equal(previous.length, 32);
  const currentResult = await authenticateReconcileRequest(
    buildRequest('{}', {
      'x-druza-timestamp': FIXTURE_TIMESTAMP,
      'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
    }),
    {
      currentSecret: FIXTURE_SECRET_CURRENT,
      nowMs: FIXTURE_NOW_MS,
    },
  );
  assert.deepEqual(currentResult, {
    ok: true,
    bodyText: '{}',
    matchedSecret: 'current',
    version: 'v1',
  });

  const previousResult = await authenticateReconcileRequest(
    buildRequest('{}', {
      'x-druza-timestamp': FIXTURE_TIMESTAMP,
      'x-druza-signature': FIXTURE_SIGNATURE_HEADER_PREVIOUS,
    }),
    {
      currentSecret: FIXTURE_SECRET_CURRENT,
      previousSecret: FIXTURE_SECRET_PREVIOUS,
      nowMs: FIXTURE_NOW_MS,
    },
  );
  assert.deepEqual(previousResult, {
    ok: true,
    bodyText: '{}',
    matchedSecret: 'previous',
    version: 'v1',
  });
});

test('accepts semantically empty JSON object variants', async () => {
  for (const body of ['{}', '{ }', '\n{\n}\n']) {
    const result = await authenticateReconcileRequest(
      buildRequest(body, {
        'content-type': 'application/json; charset="utf-8"',
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      {
        currentSecret: FIXTURE_SECRET_CURRENT,
        nowMs: FIXTURE_NOW_MS,
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.bodyText, '{}');
  }
});

test('rejects missing or malformed current secret with 503', async () => {
  for (const currentSecret of [undefined, '', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)]) {
    const result = await expectAuthFailure(
      buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      { currentSecret },
    );
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      code: 'hmac_unavailable',
    });
  }
});

test('rejects malformed previous secret fail-closed with 503', async () => {
  for (const previousSecret of ['short', 'A'.repeat(64), 'g'.repeat(64), '1'.repeat(65)]) {
    const result = await expectAuthFailure(
      buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      {
        currentSecret: FIXTURE_SECRET_CURRENT,
        previousSecret,
      },
    );
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      code: 'hmac_unavailable',
    });
  }

  const ok = await authenticateReconcileRequest(
    buildRequest('{}', {
      'x-druza-timestamp': FIXTURE_TIMESTAMP,
      'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
    }),
    {
      currentSecret: FIXTURE_SECRET_CURRENT,
      previousSecret: '',
      nowMs: FIXTURE_NOW_MS,
    },
  );
  assert.equal(ok.ok, true);
});

test('rejects malformed timestamp header', async () => {
  for (const timestamp of ['', '1,2', '1764201600.5', '17642016000', '-1']) {
    const result = await expectAuthFailure(
      buildRequest('{}', {
        'x-druza-timestamp': timestamp,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
    );
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      code: 'invalid_request',
    });
  }
});

test('rejects expired or future timestamp header outside skew', async () => {
  const expired = await expectAuthFailure(
    buildRequest('{}', {
      'x-druza-timestamp': String((FIXTURE_NOW_MS - RECONCILE_AUTH_SKEW_MS - 1_000) / 1000),
      'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
    }),
  );
  assert.deepEqual(expired, {
    ok: false,
    status: 401,
    code: 'unauthorized',
  });

  const future = await expectAuthFailure(
    buildRequest('{}', {
      'x-druza-timestamp': String((FIXTURE_NOW_MS + RECONCILE_AUTH_SKEW_MS + 1_000) / 1000),
      'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
    }),
  );
  assert.deepEqual(future, {
    ok: false,
    status: 401,
    code: 'unauthorized',
  });
});

test('rejects missing or malformed signature header', async () => {
  for (const signature of ['', 'v1=abc', 'v2=' + 'a'.repeat(64), 'v1=' + 'A'.repeat(64), 'v1=' + 'a'.repeat(65), 'v1=' + 'a'.repeat(32) + ',' + 'b'.repeat(32)]) {
    const result = await expectAuthFailure(
      buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': signature,
      }),
    );
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      code: 'invalid_request',
    });
  }
});

test('rejects incorrect signature, method, path, query string, content type, invalid or non-empty body', async () => {
  const cases: Array<{ request: Request; expectedStatus: 400 | 401 }> = [
    {
      request: buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': 'v1=' + '0'.repeat(64),
      }),
      expectedStatus: 401,
    },
    {
      request: buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }, { method: 'GET' }),
      expectedStatus: 401,
    },
    {
      request: buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }, { path: '/functions/v1/reconcile-stale-payments?x=1' }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('{}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }, { path: '/functions/v1/reconcile-stale-payments?' }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('{}', {
        'content-type': 'text/plain',
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('{}', {
        'content-type': 'application/json; charset=utf-16',
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('[]', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('null', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('"x"', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('{"a":1}', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
    {
      request: buildRequest('{', {
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      }),
      expectedStatus: 400,
    },
  ];

  for (const { request, expectedStatus } of cases) {
    const result = await expectAuthFailure(request);
    assert.equal(result.status, expectedStatus);
  }
});

test('rejects body larger than one kibibyte', async () => {
  const body = `{"pad":"${'x'.repeat(RECONCILE_AUTH_MAX_BODY_BYTES)}"}`;
  const result = await expectAuthFailure(
    buildRequest(body, {
      'x-druza-timestamp': FIXTURE_TIMESTAMP,
      'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
    }),
  );
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    code: 'invalid_request',
  });
});

test('stops streaming once the body exceeds one kibibyte', async () => {
  let pulls = 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(600).fill(0x20));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request(
    `https://example.com${RECONCILE_AUTH_PATH}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' },
  );

  const result = await expectAuthFailure(request);
  assert.equal(result.status, 400);
  assert.equal(canceled, true);
  assert.ok(pulls <= 3);
});

test('rejects invalid UTF-8 without echoing bytes', async () => {
  const request = new Request(
    `https://example.com${RECONCILE_AUTH_PATH}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-druza-timestamp': FIXTURE_TIMESTAMP,
        'x-druza-signature': FIXTURE_SIGNATURE_HEADER_CURRENT,
      },
      body: Uint8Array.from([0xc3, 0x28]),
    },
  );
  const result = await expectAuthFailure(request);
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    code: 'invalid_request',
  });
});

test('constant-time comparison only accepts equal 32-byte digests', () => {
  const a = Uint8Array.from({ length: 32 }, (_, index) => index);
  const b = Uint8Array.from({ length: 32 }, (_, index) => index);
  const c = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
  const short = Uint8Array.from([1, 2, 3]);
  assert.equal(constantTimeDigestEquals(a, b), true);
  assert.equal(constantTimeDigestEquals(a, c), false);
  assert.equal(constantTimeDigestEquals(a, short), false);
  assert.equal(constantTimeDigestEquals(short, a), false);
});

test('does not leak secret, signature or body in failure payloads', async () => {
  const body = '{"leak":"no"}';
  const signature = 'v1=' + '0'.repeat(64);
  const result = await expectAuthFailure(
    buildRequest(body, {
      'x-druza-timestamp': FIXTURE_TIMESTAMP,
      'x-druza-signature': signature,
    }),
  );
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    FIXTURE_SECRET_CURRENT,
    FIXTURE_SECRET_PREVIOUS,
    FIXTURE_SIGNATURE_CURRENT,
    FIXTURE_SIGNATURE_PREVIOUS,
    signature,
    body,
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('handler authenticates before every privileged boundary and keeps logs generic', async () => {
  const source = await readFile(
    new URL('../reconcile-stale-payments/index.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /_shared\/supabase-env\.ts/);
  assert.doesNotMatch(source, /^const\s+MP_ACCESS_TOKEN\s*=/m);

  const handlerStart = source.indexOf('Deno.serve(async (req: Request) => {');
  const authCall = source.indexOf(
    'const auth = await authenticateReconcileRequest(req, {',
    handlerStart,
  );
  const privilegedConfigCall = source.indexOf(
    'const privilegedConfig = readPrivilegedConfig();',
    authCall,
  );
  const createClientCall = source.indexOf('const admin = createClient(', authCall);
  const durableLimitCall = source.indexOf(
    'const shouldRun = await consumeDurableLimit(',
    authCall,
  );

  assert.ok(handlerStart >= 0);
  assert.ok(authCall > handlerStart);
  assert.ok(privilegedConfigCall > authCall);
  assert.ok(createClientCall > privilegedConfigCall);
  assert.ok(durableLimitCall > createClientCall);

  const beforeAuth = source.slice(handlerStart, authCall);
  assert.doesNotMatch(beforeAuth, /Deno\.env\.get\('SUPABASE_/);
  assert.doesNotMatch(beforeAuth, /Deno\.env\.get\('MP_ACCESS_TOKEN'/);
  assert.equal((source.match(/x-druza-reconciler-auth/g) ?? []).length, 1);

  const consoleStatements = source.match(
    /console\.(?:log|warn|error|info|debug)\([\s\S]*?\n\s*\}\);/g,
  ) ?? [];
  assert.equal(consoleStatements.length, 1);
  const logged = consoleStatements[0].toLowerCase();
  for (const forbidden of [
    'header',
    'body',
    'url',
    'ip',
    'secret',
    'signature',
    'user_id',
    'order_id',
    'payment_id',
    'email',
    'cpf',
    'profile',
  ]) {
    assert.equal(logged.includes(forbidden), false);
  }
});

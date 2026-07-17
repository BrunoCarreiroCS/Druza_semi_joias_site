export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isPaymentId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
}

export function moneyToCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;

  const text = String(value).trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? cents : null;
}

export function centsToAmount(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0 || cents > 2_147_483_647) {
    throw new Error('invalid_amount_cents');
  }
  return Number(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`);
}

export function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(object[key])}`
  )).join(',')}}`;
}

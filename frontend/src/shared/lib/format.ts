const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function formatDecimal(value: string): string {
  if (!DECIMAL_PATTERN.test(value)) {
    return value;
  }
  const [integer = '0', fraction = ''] = value.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return trimmedFraction ? `${groupedInteger},${trimmedFraction}` : groupedInteger;
}

export function formatFixedDecimal(
  value: string | number,
  fractionDigits = 2,
): string {
  const source = String(value).trim().replace(',', '.');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(source);
  if (!match || fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    return source;
  }
  const [, sign = '', integer = '0', fraction = ''] = match;
  const scale = 10n ** BigInt(fractionDigits);
  const keptFraction = fraction.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  let scaled = BigInt(integer) * scale + BigInt(keptFraction || '0');
  if ((fraction[fractionDigits] ?? '0') >= '5') scaled += 1n;
  const whole = scaled / scale;
  const remainder = (scaled % scale).toString().padStart(fractionDigits, '0');
  const prefix = sign && scaled !== 0n ? '-' : '';
  return fractionDigits === 0
    ? `${prefix}${whole}`
    : `${prefix}${whole}.${remainder}`;
}

export function formatMoney(value: string | null): string {
  return value === null ? '—' : `${formatDecimal(value)} ₽`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function isDecimal(value: string, options: {allowNegative?: boolean} = {}): boolean {
  const pattern = options.allowNegative
    ? /^-?\d+(?:[.,]\d{1,6})?$/
    : /^\d+(?:[.,]\d{1,6})?$/;
  return pattern.test(value.trim());
}

export function normalizeDecimal(value: string): string {
  return value.trim().replace(',', '.');
}

export function isHttpUrl(value: string): boolean {
  if (!value) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

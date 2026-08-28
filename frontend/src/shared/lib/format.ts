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


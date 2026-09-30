import {useState} from 'react';

export interface FundingPart {funding_source_id: string; amount: string}
function cents(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  const [whole, part = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(part.padEnd(2, '0'));
}
export function fundingTotal(quantity: string, price: string | null): string {
  const scaled = (value: string, places: number) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.');
    if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > places) return null;
    return BigInt(whole + fraction.padEnd(places, '0'));
  };
  const q = scaled(quantity, 6), p = price == null ? null : scaled(price, 2);
  if (q === null || p === null) return '';
  const amount = (q * p + 500000n) / 1000000n;
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}
export function useFundingSplit(total: string, primary: string, initialParts: FundingPart[] = []) {
  const [parts, setParts] = useState<FundingPart[]>(initialParts);
  const remaining = cents(total) - parts.reduce((sum, part) => sum + cents(part.amount), 0);
  const valid = !parts.length || (Boolean(primary) && Number.isSafeInteger(remaining) && remaining >= 0 && parts.every((part) => part.funding_source_id && cents(part.amount) > 0) && new Set([primary, ...parts.map((part) => part.funding_source_id)]).size === parts.length + 1);
  const allocations = parts.length ? [{funding_source_id: primary, amount: (remaining / 100).toFixed(2)}, ...parts.map((part) => ({...part, amount: part.amount.replace(',', '.')}))] : [];
  return {parts, setParts, remaining, valid, payload: parts.length ? {funding_allocations: allocations} : {}, reset: () => setParts([])};
}


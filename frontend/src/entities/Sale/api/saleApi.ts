import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  Sale,
  SaleCreate,
  SaleList,
  SaleListParams,
  SaleSummary,
  SaleSummaryParams,
} from '../model/types';

function buildSearch(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const saleKeys = {
  all: ['sales'] as const,
  list: (params: SaleListParams) => [...saleKeys.all, 'list', params] as const,
  summary: (params: SaleSummaryParams) =>
    [...saleKeys.all, 'summary', params] as const,
};

export async function registerSale(
  payload: SaleCreate,
  idempotencyKey: string,
): Promise<Sale> {
  return apiRequest<Sale>('/sales', {
    method: 'POST',
    headers: {'Idempotency-Key': idempotencyKey},
    body: JSON.stringify(payload),
  });
}

export function useSalesQuery(params: SaleListParams) {
  return useQuery({
    queryKey: saleKeys.list(params),
    queryFn: ({signal}) =>
      apiRequest<SaleList>(`/sales${buildSearch(params)}`, {signal}),
    placeholderData: keepPreviousData,
  });
}

export function useSalesSummaryQuery(params: SaleSummaryParams) {
  return useQuery({
    queryKey: saleKeys.summary(params),
    queryFn: ({signal}) =>
      apiRequest<SaleSummary>(`/sales/summary${buildSearch(params)}`, {signal}),
  });
}

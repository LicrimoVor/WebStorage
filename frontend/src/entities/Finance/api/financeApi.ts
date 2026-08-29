import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  FinanceEntryList,
  FinanceEntryListParams,
  FinanceSummary,
  FinanceSummaryParams,
  FinancialTransaction,
  FinancialTransactionCreate,
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

export const financeKeys = {
  all: ['finance'] as const,
  entries: (params: FinanceEntryListParams) =>
    [...financeKeys.all, 'entries', params] as const,
  summary: (params: FinanceSummaryParams) =>
    [...financeKeys.all, 'summary', params] as const,
};

export async function createFinancialTransaction(
  payload: FinancialTransactionCreate,
): Promise<FinancialTransaction> {
  return apiRequest<FinancialTransaction>('/finance/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function useFinanceEntriesQuery(params: FinanceEntryListParams) {
  return useQuery({
    queryKey: financeKeys.entries(params),
    queryFn: ({signal}) =>
      apiRequest<FinanceEntryList>(`/finance/entries${buildSearch(params)}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useFinanceSummaryQuery(params: FinanceSummaryParams) {
  return useQuery({
    queryKey: financeKeys.summary(params),
    queryFn: ({signal}) =>
      apiRequest<FinanceSummary>(`/finance/summary${buildSearch(params)}`, {
        signal,
      }),
  });
}

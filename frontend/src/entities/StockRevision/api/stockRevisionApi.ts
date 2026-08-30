import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  StockRevision,
  StockRevisionCreate,
  StockRevisionListParams,
  StockRevisionRow,
} from '../model/types';

function buildSearch(params: StockRevisionListParams) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const stockRevisionKeys = {
  all: ['stock-revision'] as const,
  rows: (params: StockRevisionListParams) =>
    [...stockRevisionKeys.all, 'rows', params] as const,
};

export function useStockRevisionRowsQuery(params: StockRevisionListParams) {
  return useQuery({
    queryKey: stockRevisionKeys.rows(params),
    queryFn: ({signal}) =>
      apiRequest<StockRevisionRow[]>(`/warehouse/revision${buildSearch(params)}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function createStockRevision(payload: StockRevisionCreate) {
  return apiRequest<StockRevision>('/warehouse/revisions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

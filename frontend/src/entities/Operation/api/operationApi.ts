import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  Operation,
  OperationCreate,
  OperationList,
  OperationListParams,
  OperationUpdate,
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

export const operationKeys = {
  all: ['operations'] as const,
  list: (params: OperationListParams) =>
    [...operationKeys.all, 'list', params] as const,
};

export async function listOperations(
  params: OperationListParams,
  signal?: AbortSignal,
): Promise<OperationList> {
  return apiRequest<OperationList>(
    `/operations${buildSearch(params)}`,
    signal ? {signal} : {},
  );
}

export function useOperationsQuery(params: OperationListParams) {
  return useQuery({
    queryKey: operationKeys.list(params),
    queryFn: ({signal}) => listOperations(params, signal),
    placeholderData: keepPreviousData,
  });
}

export async function createOperation(payload: OperationCreate): Promise<Operation> {
  return apiRequest<Operation>('/operations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateOperation(
  id: string,
  payload: OperationUpdate,
): Promise<Operation> {
  return apiRequest<Operation>(`/operations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function archiveOperation(id: string): Promise<Operation> {
  return apiRequest<Operation>(`/operations/${id}/archive`, {method: 'POST'});
}

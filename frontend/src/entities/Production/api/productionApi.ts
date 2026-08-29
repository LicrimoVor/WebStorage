import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  ProductionRecord,
  ProductionRecordCreate,
  ProductionRecordList,
  DirectProductionCreate,
  DirectProductionPreview,
} from '../model/types';

export const productionKeys = {
  all: ['production-records'] as const,
  plan: (planId: string) => [...productionKeys.all, planId] as const,
  preview: (itemId: string, quantity: string) =>
    [...productionKeys.all, 'preview', itemId, quantity] as const,
};

export async function registerProduction(
  planId: string,
  payload: ProductionRecordCreate,
  idempotencyKey: string,
): Promise<ProductionRecord> {
  return apiRequest<ProductionRecord>(
    `/production-plans/${planId}/production-records`,
    {
      method: 'POST',
      headers: {'Idempotency-Key': idempotencyKey},
      body: JSON.stringify(payload),
    },
  );
}

export async function previewDirectProduction(
  itemId: string,
  quantity: string,
  signal?: AbortSignal,
): Promise<DirectProductionPreview> {
  return apiRequest<DirectProductionPreview>(
    `/manufactured-items/${itemId}/production-preview`,
    {
      method: 'POST',
      body: JSON.stringify({quantity}),
      ...(signal ? {signal} : {}),
    },
  );
}

export function useDirectProductionPreviewQuery(
  itemId: string,
  quantity: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: productionKeys.preview(itemId, quantity),
    queryFn: ({signal}) => previewDirectProduction(itemId, quantity, signal),
    enabled,
    retry: false,
  });
}

export async function registerDirectProduction(
  itemId: string,
  payload: DirectProductionCreate,
  idempotencyKey: string,
): Promise<ProductionRecord> {
  return apiRequest<ProductionRecord>(`/manufactured-items/${itemId}/produce`, {
    method: 'POST',
    headers: {'Idempotency-Key': idempotencyKey},
    body: JSON.stringify(payload),
  });
}

export async function listProductionRecords(
  planId: string,
  signal?: AbortSignal,
): Promise<ProductionRecordList> {
  return apiRequest<ProductionRecordList>(
    `/production-plans/${planId}/production-records?page=1&page_size=20`,
    signal ? {signal} : {},
  );
}

export function useProductionRecordsQuery(planId: string, enabled: boolean) {
  return useQuery({
    queryKey: productionKeys.plan(planId),
    queryFn: ({signal}) => listProductionRecords(planId, signal),
    enabled,
  });
}

import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  ProductionPlan,
  ProductionPlanCreate,
  ProductionPlanList,
  ProductionPlanListParams,
  ProductionPlanSummary,
  ProductionPlanUpdate,
} from '../model/types';

function buildSearch(params: ProductionPlanListParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  return `?${search.toString()}`;
}

export const productionPlanKeys = {
  all: ['production-plans'] as const,
  lists: () => [...productionPlanKeys.all, 'list'] as const,
  list: (params: ProductionPlanListParams) =>
    [...productionPlanKeys.lists(), params] as const,
  summary: () => [...productionPlanKeys.all, 'summary'] as const,
};

export async function listProductionPlans(
  params: ProductionPlanListParams,
  signal?: AbortSignal,
): Promise<ProductionPlanList> {
  return apiRequest<ProductionPlanList>(
    `/production-plans${buildSearch(params)}`,
    signal ? {signal} : {},
  );
}

export function useProductionPlansQuery(params: ProductionPlanListParams) {
  return useQuery({
    queryKey: productionPlanKeys.list(params),
    queryFn: ({signal}) => listProductionPlans(params, signal),
    placeholderData: keepPreviousData,
  });
}

export async function getProductionPlanSummary(
  signal?: AbortSignal,
): Promise<ProductionPlanSummary> {
  return apiRequest<ProductionPlanSummary>(
    '/production-plans/summary',
    signal ? {signal} : {},
  );
}

export function useProductionPlanSummaryQuery() {
  return useQuery({
    queryKey: productionPlanKeys.summary(),
    queryFn: ({signal}) => getProductionPlanSummary(signal),
  });
}

export async function createProductionPlan(
  payload: ProductionPlanCreate,
): Promise<ProductionPlan> {
  return apiRequest<ProductionPlan>('/production-plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProductionPlan(
  planId: string,
  payload: ProductionPlanUpdate,
): Promise<ProductionPlan> {
  return apiRequest<ProductionPlan>(`/production-plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function recalculateProductionPlan(
  planId: string,
): Promise<ProductionPlan> {
  return apiRequest<ProductionPlan>(
    `/production-plans/${planId}/recalculate`,
    {
      method: 'POST',
      body: JSON.stringify({use_latest_process_version: true}),
    },
  );
}

import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {AnalyticsDashboard, AnalyticsDashboardParams} from '../model/types';

function buildSearch(params: AnalyticsDashboardParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  return `?${search.toString()}`;
}

export const analyticsKeys = {
  all: ['analytics'] as const,
  dashboard: (params: AnalyticsDashboardParams) =>
    [...analyticsKeys.all, 'dashboard', params] as const,
};

export function useAnalyticsDashboardQuery(params: AnalyticsDashboardParams) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(params),
    queryFn: ({signal}) =>
      apiRequest<AnalyticsDashboard>(
        `/analytics/dashboard${buildSearch(params)}`,
        {signal},
      ),
  });
}

import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';
import type {components} from '@/shared/api/generated/schema';

export type ProcurementItem = components['schemas']['ProcurementItemRead'];
export type ProcurementList = components['schemas']['ProcurementList'];

export function useProcurementQuery(page: number, search: string) {
  return useQuery({
    queryKey: ['procurement', {page, search}],
    queryFn: ({signal}) => apiRequest<ProcurementList>(
      `/procurement?${new URLSearchParams({page: String(page), search})}`, {signal},
    ),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

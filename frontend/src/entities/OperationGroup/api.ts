import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/shared/api';
export interface OperationGroup {id: string; name: string}
export const operationGroupKeys = ['operation-groups'] as const;
export function useOperationGroupsQuery() {
  return useQuery({queryKey: operationGroupKeys, queryFn: ({signal}) =>
    apiRequest<OperationGroup[]>('/operation-groups', {signal})});
}

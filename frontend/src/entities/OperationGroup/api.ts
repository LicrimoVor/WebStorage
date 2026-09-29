import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/shared/api';
export interface OperationGroup {id: string; name: string; parent_id?: string | null}
export function operationGroupLabel(group: OperationGroup, groups: OperationGroup[]) {
  const parent = groups.find((candidate) => candidate.id === group.parent_id);
  return parent ? `${parent.name} / ${group.name}` : group.name;
}
export const operationGroupKeys = ['operation-groups'] as const;
export function useOperationGroupsQuery() {
  return useQuery({queryKey: operationGroupKeys, queryFn: ({signal}) =>
    apiRequest<OperationGroup[]>('/operation-groups', {signal})});
}

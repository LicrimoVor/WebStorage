import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  InventoryGroup,
  InventoryGroupCreate,
  InventoryGroupUpdate,
} from '../model/types';

export const inventoryGroupKeys = {
  all: ['inventory-groups'] as const,
};

export async function listInventoryGroups(signal?: AbortSignal) {
  return apiRequest<InventoryGroup[]>('/inventory-groups', signal ? {signal} : {});
}

export function useInventoryGroupsQuery() {
  return useQuery({
    queryKey: inventoryGroupKeys.all,
    queryFn: ({signal}) => listInventoryGroups(signal),
  });
}

export async function createInventoryGroup(payload: InventoryGroupCreate) {
  return apiRequest<InventoryGroup>('/inventory-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInventoryGroup(id: string, payload: InventoryGroupUpdate) {
  return apiRequest<InventoryGroup>(`/inventory-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryGroup(id: string) {
  return apiRequest<void>(`/inventory-groups/${id}`, {method: 'DELETE'});
}

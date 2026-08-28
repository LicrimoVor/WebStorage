import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  InventoryMovementCreate,
  InventoryMovementList,
  InventoryMovement,
  Material,
  MaterialCreate,
  MaterialList,
  MaterialListParams,
  MaterialUpdate,
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

export const materialKeys = {
  all: ['materials'] as const,
  list: (params: MaterialListParams) => [...materialKeys.all, 'list', params] as const,
  detail: (id: string) => [...materialKeys.all, 'detail', id] as const,
  movements: (id: string, page: number, pageSize: number) =>
    [...materialKeys.all, 'movements', id, page, pageSize] as const,
};

export async function listMaterials(
  params: MaterialListParams,
  signal?: AbortSignal,
): Promise<MaterialList> {
  return apiRequest<MaterialList>(
    `/materials${buildSearch(params)}`,
    signal ? {signal} : {},
  );
}

export function useMaterialsQuery(params: MaterialListParams) {
  return useQuery({
    queryKey: materialKeys.list(params),
    queryFn: ({signal}) => listMaterials(params, signal),
    placeholderData: keepPreviousData,
  });
}

export async function createMaterial(payload: MaterialCreate): Promise<Material> {
  return apiRequest<Material>('/materials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMaterial(id: string, payload: MaterialUpdate): Promise<Material> {
  return apiRequest<Material>(`/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function archiveMaterial(id: string): Promise<Material> {
  return apiRequest<Material>(`/materials/${id}/archive`, {method: 'POST'});
}

export async function createInventoryMovement(
  materialId: string,
  payload: InventoryMovementCreate,
): Promise<InventoryMovement> {
  return apiRequest<InventoryMovement>(`/materials/${materialId}/movements`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listInventoryMovements(
  materialId: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<InventoryMovementList> {
  return apiRequest<InventoryMovementList>(
    `/materials/${materialId}/movements${buildSearch({page, page_size: pageSize})}`,
    signal ? {signal} : {},
  );
}

export function useInventoryMovementsQuery(
  materialId: string,
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: materialKeys.movements(materialId, page, pageSize),
    queryFn: ({signal}) =>
      listInventoryMovements(materialId, page, pageSize, signal),
    enabled,
  });
}

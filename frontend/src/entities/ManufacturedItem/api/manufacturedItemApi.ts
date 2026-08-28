import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  InventoryMovementCreate,
  ManufacturedItem,
  ManufacturedItemCreate,
  ManufacturedItemList,
  ManufacturedItemListParams,
  ManufacturedItemMovement,
  ManufacturedItemMovementList,
  ManufacturedItemUpdate,
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

export const manufacturedItemKeys = {
  all: ['manufactured-items'] as const,
  list: (params: ManufacturedItemListParams) =>
    [...manufacturedItemKeys.all, 'list', params] as const,
  detail: (id: string) => [...manufacturedItemKeys.all, 'detail', id] as const,
  movements: (id: string, page: number, pageSize: number) =>
    [...manufacturedItemKeys.all, 'movements', id, page, pageSize] as const,
};

export async function listManufacturedItems(
  params: ManufacturedItemListParams,
  signal?: AbortSignal,
): Promise<ManufacturedItemList> {
  return apiRequest<ManufacturedItemList>(
    `/manufactured-items${buildSearch(params)}`,
    signal ? {signal} : {},
  );
}

export function useManufacturedItemsQuery(params: ManufacturedItemListParams) {
  return useQuery({
    queryKey: manufacturedItemKeys.list(params),
    queryFn: ({signal}) => listManufacturedItems(params, signal),
    placeholderData: keepPreviousData,
  });
}

export async function createManufacturedItem(
  payload: ManufacturedItemCreate,
): Promise<ManufacturedItem> {
  return apiRequest<ManufacturedItem>('/manufactured-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateManufacturedItem(
  id: string,
  payload: ManufacturedItemUpdate,
): Promise<ManufacturedItem> {
  return apiRequest<ManufacturedItem>(`/manufactured-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function archiveManufacturedItem(id: string): Promise<ManufacturedItem> {
  return apiRequest<ManufacturedItem>(`/manufactured-items/${id}/archive`, {
    method: 'POST',
  });
}

export async function createManufacturedItemMovement(
  itemId: string,
  payload: InventoryMovementCreate,
): Promise<ManufacturedItemMovement> {
  return apiRequest<ManufacturedItemMovement>(
    `/manufactured-items/${itemId}/movements`,
    {method: 'POST', body: JSON.stringify(payload)},
  );
}

export async function listManufacturedItemMovements(
  itemId: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ManufacturedItemMovementList> {
  return apiRequest<ManufacturedItemMovementList>(
    `/manufactured-items/${itemId}/movements${buildSearch({page, page_size: pageSize})}`,
    signal ? {signal} : {},
  );
}

export function useManufacturedItemMovementsQuery(
  itemId: string,
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: manufacturedItemKeys.movements(itemId, page, pageSize),
    queryFn: ({signal}) =>
      listManufacturedItemMovements(itemId, page, pageSize, signal),
    enabled,
  });
}

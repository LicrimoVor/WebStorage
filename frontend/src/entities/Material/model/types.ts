import type {components, operations} from '@/shared/api/generated/schema';

export type Material = components['schemas']['MaterialRead'];
export type MaterialList = components['schemas']['MaterialList'];
export type MaterialCreate = components['schemas']['MaterialCreate'];
export type MaterialUpdate = components['schemas']['MaterialUpdate'];
export type MaterialListParams = NonNullable<
  operations['listMaterials']['parameters']['query']
>;
export type MaterialSortField = components['schemas']['MaterialSortField'];
export type SortOrder = components['schemas']['SortOrder'];
export type AvailabilityFilter = components['schemas']['AvailabilityFilter'];
export type InventoryMovement = components['schemas']['InventoryMovementRead'];
export type InventoryMovementList = components['schemas']['InventoryMovementList'];
export type InventoryMovementCreate = components['schemas']['InventoryMovementCreate'];
export type ManualMovementType = components['schemas']['ManualMovementType'];

export interface MaterialFormValue {
  name: string;
  unit: string;
  initialQuantity: string;
  price: string;
  url: string;
  image: string;
}


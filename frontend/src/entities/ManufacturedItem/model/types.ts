import type {components, operations} from '@/shared/api/generated/schema';

export type ManufacturedItem = components['schemas']['ManufacturedItemRead'];
export type ManufacturedItemList = components['schemas']['ManufacturedItemList'];
export type ManufacturedItemCreate = components['schemas']['ManufacturedItemCreate'];
export type ManufacturedItemUpdate = components['schemas']['ManufacturedItemUpdate'];
export type ManufacturedItemMovement =
  components['schemas']['ManufacturedItemMovementRead'];
export type ManufacturedItemMovementList =
  components['schemas']['ManufacturedItemMovementList'];
export type InventoryMovementCreate = components['schemas']['InventoryMovementCreate'];
export type ManualMovementType = components['schemas']['ManualMovementType'];
export type ManufacturedItemListParams = NonNullable<
  operations['listManufacturedItems']['parameters']['query']
>;
export type ManufacturedItemSortField =
  components['schemas']['ManufacturedItemSortField'];
export type ManufacturedItemKind = components['schemas']['ManufacturedItemKind'];
export type SortOrder = components['schemas']['SortOrder'];
export type AvailabilityFilter = components['schemas']['AvailabilityFilter'];

export interface ManufacturedItemFormValue {
  name: string;
  isProduct: boolean;
  productId?: string;
  unit: string;
  initialQuantity: string;
  image: string;
  groupIds: string[];
}

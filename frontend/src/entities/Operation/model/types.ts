import type {components, operations} from '@/shared/api/generated/schema';

export type Operation = components['schemas']['OperationRead'];
export type OperationList = components['schemas']['OperationList'];
export type OperationCreate = components['schemas']['OperationCreate'];
export type OperationUpdate = components['schemas']['OperationUpdate'];
export type OperationListParams = NonNullable<
  operations['listOperations']['parameters']['query']
>;
export type OperationSortField = components['schemas']['OperationSortField'];
export type SortOrder = components['schemas']['SortOrder'];

export interface OperationFormValue {
  name: string;
  timeNorm: string;
  pricePerOperation: string;
}

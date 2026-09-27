import type {Operation, OperationFormValue} from './types';

export const emptyOperationForm: OperationFormValue = {
  name: '',
  groupId: '',
  timeNorm: '',
  pricePerOperation: '',
};

export function operationToForm(operation: Operation): OperationFormValue {
  return {
    name: operation.name,
    groupId: operation.group_id ?? "",
    timeNorm: operation.time_norm ?? '',
    pricePerOperation: operation.price_per_operation ?? '',
  };
}

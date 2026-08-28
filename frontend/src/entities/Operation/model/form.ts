import type {Operation, OperationFormValue} from './types';

export const emptyOperationForm: OperationFormValue = {
  name: '',
  timeNorm: '',
  pricePerOperation: '',
};

export function operationToForm(operation: Operation): OperationFormValue {
  return {
    name: operation.name,
    timeNorm: operation.time_norm ?? '',
    pricePerOperation: operation.price_per_operation ?? '',
  };
}

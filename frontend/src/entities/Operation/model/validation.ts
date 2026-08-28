import {isDecimal, normalizeDecimal} from '@/shared/lib';

import type {OperationFormValue} from './types';

export function validateOperationForm(value: OperationFormValue): string | null {
  if (!value.name.trim()) return 'Укажите название операции.';
  if (
    value.timeNorm &&
    (!isDecimal(value.timeNorm) || Number(normalizeDecimal(value.timeNorm)) <= 0)
  ) {
    return 'Норма времени должна быть положительным числом с точностью до 6 знаков.';
  }
  if (value.pricePerOperation && !isDecimal(value.pricePerOperation)) {
    return 'Ставка должна быть неотрицательным числом.';
  }
  return null;
}

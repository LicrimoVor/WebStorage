import {isDecimal, isHttpUrl} from '@/shared/lib';

import type {ManufacturedItemFormValue} from './types';

export function validateManufacturedItemForm(
  value: ManufacturedItemFormValue,
  includeInitialQuantity: boolean,
): string | null {
  if (!value.isProduct && !value.productId) return 'Выберите продукт для полуфабриката.';
  if (!value.name.trim()) return 'Укажите название.';
  if (!value.unit.trim()) return 'Укажите единицу измерения.';
  if (includeInitialQuantity && !isDecimal(value.initialQuantity)) {
    return 'Начальный остаток должен быть неотрицательным числом с точностью до 6 знаков.';
  }
  if (!isHttpUrl(value.image)) {
    return 'Ссылка на изображение должна начинаться с http:// или https://.';
  }
  return null;
}

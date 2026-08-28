import {isDecimal, isHttpUrl} from '@/shared/lib';

import type {MaterialFormValue} from './types';

export function validateMaterialForm(
  value: MaterialFormValue,
  includeInitialQuantity: boolean,
): string | null {
  if (!value.name.trim()) {
    return 'Укажите название материала.';
  }
  if (!value.unit.trim()) {
    return 'Укажите единицу измерения.';
  }
  if (includeInitialQuantity && !isDecimal(value.initialQuantity)) {
    return 'Начальный остаток должен быть неотрицательным числом с точностью до 6 знаков.';
  }
  if (value.price && (!isDecimal(value.price) || Number(value.price.replace(',', '.')) < 0)) {
    return 'Цена должна быть неотрицательным числом.';
  }
  if (!isHttpUrl(value.url)) {
    return 'Ссылка должна начинаться с http:// или https://.';
  }
  if (!isHttpUrl(value.image)) {
    return 'Ссылка на изображение должна начинаться с http:// или https://.';
  }
  return null;
}


import type {EmployeeFormValue} from './types';
import {isDecimal, normalizeDecimal} from '@/shared/lib';

export function validateEmployeeForm(value: EmployeeFormValue): string | null {
  if (!value.fullName.trim()) return 'Укажите ФИО сотрудника.';
  if (
    value.compensationType === 'hourly' &&
    (!isDecimal(value.hourlyRate) || Number(normalizeDecimal(value.hourlyRate)) <= 0)
  ) {
    return 'Укажите положительную почасовую ставку.';
  }
  if (value.comment.length > 2000) return 'Комментарий не должен превышать 2000 символов.';
  return null;
}

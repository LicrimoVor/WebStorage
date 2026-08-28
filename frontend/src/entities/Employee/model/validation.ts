import type {EmployeeFormValue} from './types';

export function validateEmployeeForm(value: EmployeeFormValue): string | null {
  if (!value.fullName.trim()) return 'Укажите ФИО сотрудника.';
  if (value.comment.length > 2000) return 'Комментарий не должен превышать 2000 символов.';
  return null;
}

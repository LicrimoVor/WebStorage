import type {Employee, EmployeeFormValue} from './types';

export const emptyEmployeeForm: EmployeeFormValue = {fullName: '', comment: ''};

export function employeeToForm(employee: Employee): EmployeeFormValue {
  return {fullName: employee.full_name, comment: employee.comment ?? ''};
}

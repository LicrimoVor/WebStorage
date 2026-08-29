import type {Employee, EmployeeFormValue} from './types';

export const emptyEmployeeForm: EmployeeFormValue = {
  fullName: '',
  compensationType: 'piecework',
  hourlyRate: '',
  comment: '',
};

export function employeeToForm(employee: Employee): EmployeeFormValue {
  return {
    fullName: employee.full_name,
    compensationType: employee.compensation_type,
    hourlyRate: employee.hourly_rate ?? '',
    comment: employee.comment ?? '',
  };
}

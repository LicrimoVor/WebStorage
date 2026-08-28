import type {components, operations} from '@/shared/api/generated/schema';

export type Employee = components['schemas']['EmployeeRead'];
export type EmployeeList = components['schemas']['EmployeeList'];
export type EmployeeCreate = components['schemas']['EmployeeCreate'];
export type EmployeeUpdate = components['schemas']['EmployeeUpdate'];
export type EmployeeListParams = NonNullable<
  operations['listEmployees']['parameters']['query']
>;
export type EmployeeSortField = components['schemas']['EmployeeSortField'];
export type SortOrder = components['schemas']['SortOrder'];

export interface EmployeeFormValue {
  fullName: string;
  comment: string;
}

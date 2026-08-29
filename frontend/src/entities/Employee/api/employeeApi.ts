import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  Employee,
  EmployeeCreate,
  EmployeeList,
  EmployeeListParams,
  EmployeeUpdate,
} from '../model/types';

function buildSearch(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const employeeKeys = {
  all: ['employees'] as const,
  list: (params: EmployeeListParams) =>
    [...employeeKeys.all, 'list', params] as const,
};

export async function listEmployees(
  params: EmployeeListParams,
  signal?: AbortSignal,
): Promise<EmployeeList> {
  return apiRequest<EmployeeList>(
    `/employees${buildSearch(params)}`,
    signal ? {signal} : {},
  );
}

export function useEmployeesQuery(params: EmployeeListParams, enabled = true) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: ({signal}) => listEmployees(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export async function createEmployee(payload: EmployeeCreate): Promise<Employee> {
  return apiRequest<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmployee(
  id: string,
  payload: EmployeeUpdate,
): Promise<Employee> {
  return apiRequest<Employee>(`/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function archiveEmployee(id: string): Promise<Employee> {
  return apiRequest<Employee>(`/employees/${id}/archive`, {method: 'POST'});
}

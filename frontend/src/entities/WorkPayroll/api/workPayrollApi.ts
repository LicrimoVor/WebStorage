import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  EmployeePayrollSummary,
  Payment,
  PaymentCreate,
  PaymentList,
  WorkEntry,
  WorkEntryCreate,
  WorkEntryList,
  WorkEntryUpdate,
} from '../model/types';

export const workPayrollKeys = {
  all: ['work-payroll'] as const,
  operationWork: (operationId: string, page: number) =>
    [...workPayrollKeys.all, 'operation', operationId, page] as const,
  employeeWork: (employeeId: string, page: number) =>
    [...workPayrollKeys.all, 'employee-work', employeeId, page] as const,
  payments: (employeeId: string, page: number) =>
    [...workPayrollKeys.all, 'payments', employeeId, page] as const,
  summary: (employeeId: string) =>
    [...workPayrollKeys.all, 'summary', employeeId] as const,
};

export async function createWorkEntry(
  operationId: string,
  payload: WorkEntryCreate,
): Promise<WorkEntry> {
  return apiRequest<WorkEntry>(`/operations/${operationId}/work-entries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateWorkEntry(
  workEntryId: string,
  payload: WorkEntryUpdate,
): Promise<WorkEntry> {
  return apiRequest<WorkEntry>(`/work-entries/${workEntryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function voidWorkEntry(
  workEntryId: string,
  reason: string | null,
): Promise<WorkEntry> {
  return apiRequest<WorkEntry>(`/work-entries/${workEntryId}/void`, {
    method: 'POST',
    body: JSON.stringify({reason}),
  });
}

export function useOperationWorkEntriesQuery(
  operationId: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: workPayrollKeys.operationWork(operationId, page),
    queryFn: ({signal}) =>
      apiRequest<WorkEntryList>(
        `/operations/${operationId}/work-entries?page=${page}&page_size=10`,
        {signal},
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useEmployeeWorkEntriesQuery(
  employeeId: string,
  page: number,
  enabled: boolean,
  pageSize = 10,
) {
  return useQuery({
    queryKey: workPayrollKeys.employeeWork(employeeId, page),
    queryFn: ({signal}) =>
      apiRequest<WorkEntryList>(
        `/employees/${employeeId}/work-entries?page=${page}&page_size=${pageSize}`,
        {signal},
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export async function createEmployeePayment(
  employeeId: string,
  payload: PaymentCreate,
): Promise<Payment> {
  return apiRequest<Payment>(`/employees/${employeeId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function useEmployeePaymentsQuery(
  employeeId: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: workPayrollKeys.payments(employeeId, page),
    queryFn: ({signal}) =>
      apiRequest<PaymentList>(
        `/employees/${employeeId}/payments?page=${page}&page_size=10`,
        {signal},
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useEmployeePayrollSummaryQuery(
  employeeId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: workPayrollKeys.summary(employeeId),
    queryFn: ({signal}) =>
      apiRequest<EmployeePayrollSummary>(
        `/employees/${employeeId}/payroll-summary`,
        {signal},
      ),
    enabled,
  });
}

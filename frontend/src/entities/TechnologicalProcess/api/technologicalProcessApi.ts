import {keepPreviousData, useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {
  ProcessGraphInput,
  ProcessGraphOutput,
  ProcessDraftSave,
  ProcessVersion,
  ProcessVersionList,
  TechnologicalProcess,
  TechnologicalProcessCreate,
  TechnologicalProcessImportResult,
  TechnologicalProcessList,
  TechnologicalProcessListParams,
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

export const technologicalProcessKeys = {
  all: ['technological-processes'] as const,
  list: (params: TechnologicalProcessListParams) =>
    [...technologicalProcessKeys.all, 'list', params] as const,
  detail: (processId: string) =>
    [...technologicalProcessKeys.all, 'detail', processId] as const,
  versions: (processId: string) =>
    [...technologicalProcessKeys.all, 'versions', processId] as const,
  version: (processId: string, versionId: string) =>
    [...technologicalProcessKeys.versions(processId), versionId] as const,
};

export async function listTechnologicalProcesses(
  params: TechnologicalProcessListParams,
  signal?: AbortSignal,
): Promise<TechnologicalProcessList> {
  return apiRequest<TechnologicalProcessList>(
    `/technological-processes${buildSearch(params)}`,
    signal ? {signal} : {},
  );
}

export function useTechnologicalProcessesQuery(
  params: TechnologicalProcessListParams,
) {
  return useQuery({
    queryKey: technologicalProcessKeys.list(params),
    queryFn: ({signal}) => listTechnologicalProcesses(params, signal),
    placeholderData: keepPreviousData,
  });
}

export async function getTechnologicalProcess(
  processId: string,
  signal?: AbortSignal,
): Promise<TechnologicalProcess> {
  return apiRequest<TechnologicalProcess>(
    `/technological-processes/${processId}`,
    signal ? {signal} : {},
  );
}

export function useTechnologicalProcessQuery(processId: string) {
  return useQuery({
    queryKey: technologicalProcessKeys.detail(processId),
    queryFn: ({signal}) => getTechnologicalProcess(processId, signal),
    enabled: Boolean(processId),
  });
}

export async function createTechnologicalProcess(
  payload: TechnologicalProcessCreate,
): Promise<TechnologicalProcessImportResult> {
  return apiRequest<TechnologicalProcessImportResult>('/technological-processes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function importTechnologicalProcess(
  payload: ProcessGraphInput,
): Promise<TechnologicalProcessImportResult> {
  return apiRequest<TechnologicalProcessImportResult>(
    '/technological-processes/import',
    {method: 'POST', body: JSON.stringify(payload)},
  );
}

export async function archiveTechnologicalProcess(
  processId: string,
): Promise<TechnologicalProcess> {
  return apiRequest<TechnologicalProcess>(
    `/technological-processes/${processId}/archive`,
    {method: 'POST'},
  );
}

export async function listTechnologicalProcessVersions(
  processId: string,
  signal?: AbortSignal,
): Promise<ProcessVersionList> {
  return apiRequest<ProcessVersionList>(
    `/technological-processes/${processId}/versions`,
    signal ? {signal} : {},
  );
}

export function useTechnologicalProcessVersionsQuery(processId: string) {
  return useQuery({
    queryKey: technologicalProcessKeys.versions(processId),
    queryFn: ({signal}) => listTechnologicalProcessVersions(processId, signal),
    enabled: Boolean(processId),
  });
}

export async function getTechnologicalProcessVersion(
  processId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<ProcessVersion> {
  return apiRequest<ProcessVersion>(
    `/technological-processes/${processId}/versions/${versionId}`,
    signal ? {signal} : {},
  );
}

export function useTechnologicalProcessVersionQuery(
  processId: string,
  versionId: string,
) {
  return useQuery({
    queryKey: technologicalProcessKeys.version(processId, versionId),
    queryFn: ({signal}) =>
      getTechnologicalProcessVersion(processId, versionId, signal),
    enabled: Boolean(processId && versionId),
  });
}

export async function createTechnologicalProcessVersion(
  processId: string,
  sourceVersionId?: string,
): Promise<ProcessVersion> {
  return apiRequest<ProcessVersion>(
    `/technological-processes/${processId}/versions`,
    {
      method: 'POST',
      body: JSON.stringify({source_version_id: sourceVersionId ?? null}),
    },
  );
}

export async function replaceTechnologicalProcessGraph(
  processId: string,
  versionId: string,
  payload: ProcessGraphInput,
): Promise<ProcessVersion> {
  return apiRequest<ProcessVersion>(
    `/technological-processes/${processId}/versions/${versionId}/graph`,
    {method: 'PUT', body: JSON.stringify(payload)},
  );
}

export async function saveTechnologicalProcessDraft(
  processId: string,
  versionId: string,
  payload: ProcessDraftSave,
): Promise<ProcessVersion> {
  return apiRequest<ProcessVersion>(
    `/technological-processes/${processId}/versions/${versionId}/draft`,
    {method: 'PUT', body: JSON.stringify(payload)},
  );
}

export async function activateTechnologicalProcessVersion(
  processId: string,
  versionId: string,
): Promise<ProcessVersion> {
  return apiRequest<ProcessVersion>(
    `/technological-processes/${processId}/versions/${versionId}/activate`,
    {method: 'POST'},
  );
}

export async function exportTechnologicalProcessVersion(
  processId: string,
  versionId: string,
): Promise<ProcessGraphOutput> {
  return apiRequest<ProcessGraphOutput>(
    `/technological-processes/${processId}/versions/${versionId}/export`,
  );
}

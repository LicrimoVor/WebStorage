import {useQuery} from '@tanstack/react-query';

import {apiRequest, type ImageUploadRequest} from '@/shared/api';
import {API_URL} from '@/shared/config';

import type {
  InstructionAsset,
  InstructionDraftSave,
  InstructionExportFormat,
  InstructionVersion,
  OperationInstruction,
  PublicInstruction,
  PublicLink,
  PublicLinkCreate,
} from '../model/types';

export const operationInstructionKeys = {
  all: ['operation-instructions'] as const,
  detail: (operationId: string) =>
    [...operationInstructionKeys.all, operationId] as const,
  assets: (operationId: string) =>
    [...operationInstructionKeys.detail(operationId), 'assets'] as const,
  links: (operationId: string) =>
    [...operationInstructionKeys.detail(operationId), 'public-links'] as const,
  public: (token: string) => ['public-operation-instruction', token] as const,
};

export function getOperationInstruction(
  operationId: string,
  signal?: AbortSignal,
): Promise<OperationInstruction> {
  return apiRequest(
    `/operations/${operationId}/instruction`,
    signal ? {signal} : {},
  );
}

export function useOperationInstructionQuery(operationId: string) {
  return useQuery({
    queryKey: operationInstructionKeys.detail(operationId),
    queryFn: ({signal}) => getOperationInstruction(operationId, signal),
    enabled: Boolean(operationId),
  });
}

export function saveOperationInstructionDraft(
  operationId: string,
  payload: InstructionDraftSave,
): Promise<InstructionVersion> {
  return apiRequest(`/operations/${operationId}/instruction/draft`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function publishOperationInstruction(
  operationId: string,
): Promise<InstructionVersion> {
  return apiRequest(`/operations/${operationId}/instruction/publish`, {
    method: 'POST',
  });
}

export function getOperationInstructionVersion(
  operationId: string,
  versionId: string,
): Promise<InstructionVersion> {
  return apiRequest(
    `/operations/${operationId}/instruction/versions/${versionId}`,
  );
}

export function listOperationInstructionAssets(
  operationId: string,
): Promise<InstructionAsset[]> {
  return apiRequest(`/operations/${operationId}/instruction/assets`);
}

export function uploadOperationInstructionAsset(
  operationId: string,
  payload: ImageUploadRequest,
): Promise<InstructionAsset> {
  return apiRequest(`/operations/${operationId}/instruction/assets`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteOperationInstructionAsset(
  operationId: string,
  assetId: string,
): Promise<void> {
  return apiRequest(`/operations/${operationId}/instruction/assets/${assetId}`, {
    method: 'DELETE',
  });
}

export function listOperationInstructionPublicLinks(
  operationId: string,
): Promise<PublicLink[]> {
  return apiRequest(`/operations/${operationId}/instruction/public-links`);
}

export function createOperationInstructionPublicLink(
  operationId: string,
  payload: PublicLinkCreate,
): Promise<PublicLink> {
  return apiRequest(`/operations/${operationId}/instruction/public-links`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function revokeOperationInstructionPublicLink(
  operationId: string,
  linkId: string,
): Promise<PublicLink> {
  return apiRequest(
    `/operations/${operationId}/instruction/public-links/${linkId}/revoke`,
    {method: 'POST'},
  );
}

export function getPublicOperationInstruction(
  token: string,
  signal?: AbortSignal,
): Promise<PublicInstruction> {
  return apiRequest(
    `/public/instructions/${encodeURIComponent(token)}`,
    signal ? {signal} : {},
  );
}

export function usePublicOperationInstructionQuery(token: string) {
  return useQuery({
    queryKey: operationInstructionKeys.public(token),
    queryFn: ({signal}) => getPublicOperationInstruction(token, signal),
    enabled: Boolean(token),
    retry: false,
  });
}

export function operationInstructionExportUrl(
  operationId: string,
  format: InstructionExportFormat,
  versionId?: string,
): string {
  const query = versionId ? `?version_id=${encodeURIComponent(versionId)}` : '';
  return `${API_URL}/operations/${operationId}/instruction/export/${format}${query}`;
}

export function publicInstructionQrUrl(token: string): string {
  return `${API_URL}/public/instructions/${encodeURIComponent(token)}/qr.svg`;
}

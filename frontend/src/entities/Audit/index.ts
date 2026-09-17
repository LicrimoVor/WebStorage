import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';
import type {components, operations} from '@/shared/api/generated/schema';

export type AuditEvent = components['schemas']['AuditEventRead'];
export type AuditParams = NonNullable<operations['listAuditEvents']['parameters']['query']>;

export function useAuditEventsQuery(params: AuditParams, enabled = true) {
  return useQuery({
    queryKey: ['audit-events', params],
    enabled,
    queryFn: ({signal}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
      });
      return apiRequest<components['schemas']['AuditEventList']>(`/audit-events?${query}`, {signal});
    },
  });
}

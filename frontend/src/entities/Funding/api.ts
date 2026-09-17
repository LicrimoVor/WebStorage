import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/shared/api';
export interface FundingSource { id: string; name: string }
export function useFundingSources() {
  return useQuery({ queryKey: ['funding-sources'], queryFn: () => apiRequest<FundingSource[]>('/funding-sources') });
}

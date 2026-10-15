import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/shared/api';

import type {components} from '@/shared/api/generated/schema';
export type ExternalProvider = components['schemas']['ProviderRead'];
export type ExternalMaterial = components['schemas']['ExternalMaterial'];
export type ExternalOffer = Omit<components['schemas']['OfferRead'], 'materials'> & {materials: ExternalMaterial[]};
export type OfferInput = Pick<ExternalOffer, 'provider_id' | 'process_id' | 'active'>;
export const externalKeys = ['externals'] as const;
export function useExternalProvidersQuery() {
  return useQuery({queryKey: [...externalKeys, 'providers'], queryFn: ({signal}) => apiRequest<ExternalProvider[]>('/external-providers', {signal})});
}
export function useExternalOffersQuery() {
  return useQuery({queryKey: [...externalKeys, 'offers'], queryFn: ({signal}) => apiRequest<ExternalOffer[]>('/external-offers', {signal})});
}
export function saveExternalProvider(name: string, id?: string) {
  return apiRequest<ExternalProvider>(`/external-providers${id ? `/${id}` : ''}`, {method: id ? 'PATCH' : 'POST', body: JSON.stringify({name})});
}
export function saveExternalOffer(payload: OfferInput, id?: string) {
  return apiRequest<ExternalOffer>(`/external-offers${id ? `/${id}` : ''}`, {method: id ? 'PUT' : 'POST', body: JSON.stringify(payload)});
}

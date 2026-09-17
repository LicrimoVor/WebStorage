import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {AuthProfile, AuthSession, ChangePasswordRequest, LoginRequest} from '../model/types';

export const authKeys = {
  session: ['auth', 'session'] as const,
  profile: ['auth', 'profile'] as const,
};

export function getAuthSession(signal?: AbortSignal) {
  return apiRequest<AuthSession>('/auth/session', signal ? {signal} : {});
}

export function useAuthSessionQuery() {
  return useQuery({
    queryKey: authKeys.session,
    queryFn: ({signal}) => getAuthSession(signal),
    retry: false,
    staleTime: 60_000,
  });
}

export function login(payload: LoginRequest) {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return apiRequest<void>('/auth/logout', {method: 'POST'});
}

export function useAuthProfileQuery() {
  return useQuery({
    queryKey: authKeys.profile,
    queryFn: ({signal}) => apiRequest<AuthProfile>('/auth/profile', {signal}),
  });
}

export function changePassword(payload: ChangePasswordRequest) {
  return apiRequest<void>('/auth/password', {method: 'POST', body: JSON.stringify(payload)});
}

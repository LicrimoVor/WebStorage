import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';

import type {AuthSession, LoginRequest} from '../model/types';

export const authKeys = {
  session: ['auth', 'session'] as const,
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

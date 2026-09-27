import {useQuery} from '@tanstack/react-query';

import {apiRequest} from '@/shared/api';
import {saveTokens, clearTokens, getRefreshToken, type TokenPair} from '@/shared/api/tokens';

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

export async function login(payload: LoginRequest) {
  const result = await apiRequest<AuthSession & TokenPair>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  saveTokens(result);
  return {username: result.username, roles: result.roles, expires_at: result.expires_at ?? null};
}

export async function logout() {
  const refresh = getRefreshToken();
  await apiRequest<void>('/auth/logout', {method: 'POST',
    ...(refresh ? {body: JSON.stringify({refresh_token: refresh})} : {}),
  });
  clearTokens();
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

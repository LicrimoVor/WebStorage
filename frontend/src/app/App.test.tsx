import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {fireEvent, render, screen} from '@testing-library/react';
import type {PropsWithChildren} from 'react';
import {expect, it, vi} from 'vitest';

import {authKeys, type AuthSession} from '@/entities/Auth';
import type * as AuthModule from '@/entities/Auth';
import {ApiError} from '@/shared/api';

import {App} from './App';

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
const nextSession: AuthSession = {username: 'operator', roles: ['warehouse']};

vi.mock('./providers/AppProviders', () => ({
  AppProviders: ({children}: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ),
}));
vi.mock('@/entities/Auth', async (importOriginal) => ({
  ...await importOriginal<typeof AuthModule>(),
  useAuthSessionQuery: () => ({
    isPending: false,
    isError: true,
    error: new ApiError({status: 401, code: 'unauthorized', detail: 'Expired'}),
  }),
}));
vi.mock('@/pages/LoginPage', () => ({
  LoginPage: ({onAuthenticated}: {onAuthenticated: (session: AuthSession) => void}) => (
    <button onClick={() => onAuthenticated(nextSession)}>Войти</button>
  ),
}));

it('removes the previous user’s business data before accepting a new session', () => {
  queryClient.setQueryData(['finance'], {balance: '100000'});
  queryClient.setQueryData(['materials'], [{name: 'Private material'}]);
  queryClient.setQueryData(authKeys.profile, {username: 'previous-user', roles: ['admin']});
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Войти'}));
    expect(queryClient.getQueryData(['finance'])).toBeUndefined();
    expect(queryClient.getQueryData(['materials'])).toBeUndefined();
    expect(queryClient.getQueryData(authKeys.profile)).toBeUndefined();
    expect(queryClient.getQueryData(authKeys.session)).toEqual(nextSession);
    expect(window.location.pathname).toBe("/production-plans");
  } finally {
    queryClient.clear();
  }
});

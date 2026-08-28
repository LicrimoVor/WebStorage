import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from '@gravity-ui/uikit';
import type {PropsWithChildren} from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {retry: false},
  },
});

export function AppProviders({children}: PropsWithChildren) {
  return (
    <ThemeProvider theme="system">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}


import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from '@gravity-ui/uikit';
import {useEffect, useState, type PropsWithChildren} from 'react';
import {ThemeContext} from './themeContext';

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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {return localStorage.getItem('webstorage-theme') === 'dark' ? 'dark' : 'light';}
    catch {return 'light';}
  });
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    const color = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (color) color.content = theme === 'dark' ? '#101217' : '#ffffff';
  }, [theme]);
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {localStorage.setItem('webstorage-theme', next);} catch { /* Theme remains usable. */ }
  };
  return (
    <ThemeContext.Provider value={{theme, toggle}}><ThemeProvider theme={theme} defaultProps={{TextInput: {size: 'l'}, Select: {size: 'l'}, TextArea: {size: 'l', minRows: 3}, Dialog: {contentOverflow: 'auto'}}}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider></ThemeContext.Provider>
  );
}

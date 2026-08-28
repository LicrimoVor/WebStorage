import {CircleQuestion} from '@gravity-ui/icons';
import {Button, Icon, PlaceholderContainer, Text} from '@gravity-ui/uikit';
import {lazy, Suspense} from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';

import {routes} from '@/shared/routes';

import styles from './App.module.scss';
import {AppProviders} from './providers/AppProviders';

const WarehousePage = lazy(async () => {
  const module = await import('@/pages/WarehousePage');
  return {default: module.WarehousePage};
});

function AppRouter() {
  return (
    <BrowserRouter>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <div className={styles.brandMark}>WS</div>
          <div className={styles.brandText}>
            <Text variant="header-1">Веб-склад</Text>
            <Text color="secondary" variant="caption-2">
              Производственный учёт
            </Text>
          </div>
          <nav className={styles.nav} aria-label="Основная навигация">
            <Button view="flat-action" href={routes.warehouse} selected>
              Склад
            </Button>
          </nav>
        </header>
        <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to={routes.warehouse} replace />} />
            <Route path={routes.warehouse} element={<WarehousePage />} />
            <Route
              path="*"
              element={
                <div className={styles.notFound}>
                  <PlaceholderContainer
                    image={<Icon data={CircleQuestion} size={48} />}
                    title="Страница не найдена"
                    description="Проверьте адрес или вернитесь на склад."
                    actions={
                      <Button view="action" href={routes.warehouse}>
                        Открыть склад
                      </Button>
                    }
                  />
                </div>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

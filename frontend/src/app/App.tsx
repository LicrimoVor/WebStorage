import { CircleQuestion } from "@gravity-ui/icons";
import { Button, Icon, PlaceholderContainer, Text } from "@gravity-ui/uikit";
import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { routes } from "@/shared/routes";

import styles from "./App.module.scss";
import { AppProviders } from "./providers/AppProviders";

const WarehousePage = lazy(async () => {
  const module = await import("@/pages/WarehousePage");
  return { default: module.WarehousePage };
});
const OperationsPage = lazy(async () => {
  const module = await import("@/pages/OperationsPage");
  return { default: module.OperationsPage };
});
const PersonnelPage = lazy(async () => {
  const module = await import("@/pages/PersonnelPage");
  return { default: module.PersonnelPage };
});
const TechnologicalProcessesPage = lazy(async () => {
  const module = await import("@/pages/TechnologicalProcessesPage");
  return { default: module.TechnologicalProcessesPage };
});
const ProcessEditorPage = lazy(async () => {
  const module = await import("@/pages/ProcessEditorPage");
  return { default: module.ProcessEditorPage };
});

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brandMark}>WS</div>
        <div className={styles.brandText}>
          <Text variant="header-1">Веб-склад</Text>
        </div>
        <nav className={styles.nav} aria-label="Основная навигация">
          <Button
            view="flat-action"
            onClick={() => navigate(routes.processes)}
            selected={location.pathname.startsWith(routes.processes)}
          >
            Техпроцессы
          </Button>
          <Button
            view="flat-action"
            onClick={() => navigate(routes.warehouse)}
            selected={location.pathname === routes.warehouse}
          >
            Склад
          </Button>
          <Button
            view="flat-action"
            onClick={() => navigate(routes.operations)}
            selected={location.pathname === routes.operations}
          >
            Операции
          </Button>
          <Button
            view="flat-action"
            onClick={() => navigate(routes.personnel)}
            selected={location.pathname === routes.personnel}
          >
            Персонал
          </Button>
        </nav>
      </header>
      <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={routes.warehouse} replace />}
          />
          <Route path={routes.warehouse} element={<WarehousePage />} />
          <Route path={routes.operations} element={<OperationsPage />} />
          <Route
            path={routes.processes}
            element={<TechnologicalProcessesPage />}
          />
          <Route
            path={routes.processEditorPattern}
            element={<ProcessEditorPage />}
          />
          <Route path={routes.personnel} element={<PersonnelPage />} />
          <Route
            path="*"
            element={
              <div className={styles.notFound}>
                <PlaceholderContainer
                  image={<Icon data={CircleQuestion} size={48} />}
                  title="Страница не найдена"
                  description="Проверьте адрес или вернитесь на склад."
                  actions={
                    <Button
                      view="action"
                      onClick={() => navigate(routes.warehouse)}
                    >
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
  );
}

function AppRouter() {
  return (
    <BrowserRouter>
      <AppLayout />
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

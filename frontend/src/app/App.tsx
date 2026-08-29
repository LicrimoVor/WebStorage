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
const ProductionPlansPage = lazy(async () => {
  const module = await import("@/pages/ProductionPlansPage");
  return { default: module.ProductionPlansPage };
});
const OperationsPage = lazy(async () => {
  const module = await import("@/pages/OperationsPage");
  return { default: module.OperationsPage };
});
const PersonnelPage = lazy(async () => {
  const module = await import("@/pages/PersonnelPage");
  return { default: module.PersonnelPage };
});
const SalesPage = lazy(async () => {
  const module = await import("@/pages/SalesPage");
  return { default: module.SalesPage };
});
const FinancePage = lazy(async () => {
  const module = await import("@/pages/FinancePage");
  return { default: module.FinancePage };
});
const AnalyticsPage = lazy(async () => {
  const module = await import("@/pages/AnalyticsPage");
  return { default: module.AnalyticsPage };
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
            onClick={() => navigate(routes.productionPlans)}
            selected={location.pathname === routes.productionPlans}
          >
            Планирование
          </Button>
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
          {/* <Button
            view="flat-action"
            onClick={() => navigate(routes.sales)}
            selected={location.pathname === routes.sales}
          >
            Продажи
          </Button> */}
          {/* <Button
            view="flat-action"
            onClick={() => navigate(routes.finance)}
            selected={location.pathname === routes.finance}
          >
            Финансы
          </Button>
          <Button
            view="flat-action"
            onClick={() => navigate(routes.analytics)}
            selected={location.pathname === routes.analytics}
          >
            Аналитика
          </Button> */}
        </nav>
      </header>
      <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={routes.productionPlans} replace />}
          />
          <Route
            path={routes.productionPlans}
            element={<ProductionPlansPage />}
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
          <Route path={routes.sales} element={<SalesPage />} />
          <Route path={routes.finance} element={<FinancePage />} />
          <Route path={routes.analytics} element={<AnalyticsPage />} />
          <Route
            path="*"
            element={
              <div className={styles.notFound}>
                <PlaceholderContainer
                  image={<Icon data={CircleQuestion} size={100} />}
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

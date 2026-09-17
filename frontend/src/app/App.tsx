import { ArrowRightFromSquare, CircleQuestion, Person } from "@gravity-ui/icons";
import { Alert, Button, Icon, PlaceholderContainer, Text } from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { routes } from "@/shared/routes";
import {
  authKeys,
  logout,
  useAuthSessionQuery,
  type AuthSession,
} from "@/entities/Auth";
import { LoginPage } from "@/pages/LoginPage";
import { ApiError, getErrorMessage } from "@/shared/api";
import { usePageMetadata } from "@/shared/lib";
import { ErrorBoundary } from "@/shared/ui";

import styles from "./App.module.scss";
import { AppProviders } from "./providers/AppProviders";

const WarehousePage = lazy(async () => {
  const module = await import("@/pages/WarehousePage");
  return { default: module.WarehousePage };
});
const ProcurementPage = lazy(async () => {
  const module = await import("@/pages/ProcurementPage");
  return { default: module.ProcurementPage };
});
const AuditPage = lazy(async () => {
  const module = await import("@/pages/AuditPage");
  return { default: module.AuditPage };
});
const StockRevisionPage = lazy(async () => {
  const module = await import("@/pages/StockRevisionPage");
  return { default: module.StockRevisionPage };
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
const ProcessPromptPage = lazy(async () => {
  const module = await import("@/pages/ProcessPromptPage");
  return { default: module.ProcessPromptPage };
});
const OperationInstructionPage = lazy(async () => {
  const module = await import("@/pages/OperationInstructionPage");
  return { default: module.OperationInstructionPage };
});
const PublicInstructionPage = lazy(async () => {
  const module = await import("@/pages/PublicInstructionPage");
  return { default: module.PublicInstructionPage };
});

function getPageMetadata(pathname: string) {
  if (pathname === routes.procurement) return ['Закупки по дефициту', 'Потребности в материалах и таблица закупок.'] as const;
  if (pathname === routes.audit) return ['Журнал событий', 'История изменений и событий системы.'] as const;
  if (pathname === routes.productionPlans) {
    return ['Планирование производства', 'Планы производства, потребности и прогресс выпуска.'] as const;
  }
  if (pathname === routes.stockRevision) {
    return ['Ревизия склада', 'Инвентаризация материалов, полуфабрикатов и продукции.'] as const;
  }
  if (pathname.startsWith(routes.warehouse)) {
    return ['Склад', 'Остатки материалов, полуфабрикатов и готовой продукции.'] as const;
  }
  if (pathname.includes('/instruction')) {
    return ['Техническая инструкция', 'Редактирование технического описания операции.'] as const;
  }
  if (pathname === routes.operations) {
    return ['Операции', 'Справочник производственных операций.'] as const;
  }
  if (pathname === routes.processPrompt) {
    return ['Промпт для техпроцесса', 'Промпт для формирования JSON технологического процесса.'] as const;
  }
  if (pathname.startsWith(routes.processes)) {
    return ['Технологические процессы', 'Версии, графы и операции технологических процессов.'] as const;
  }
  if (pathname === routes.personnel) {
    return ['Персонал', 'Сотрудники, выполненные работы и начисления.'] as const;
  }
  if (pathname === routes.sales) return ['Продажи', 'Журнал продаж готовой продукции.'] as const;
  if (pathname === routes.finance) return ['Финансы', 'Доходы, расходы и финансовая сводка.'] as const;
  if (pathname === routes.analytics) return ['Аналитика', 'Показатели производства и склада.'] as const;
  return ['Страница не найдена', 'Запрошенная страница не существует.'] as const;
}

function AppLayout({ session }: { session: AuthSession }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pageTitle, pageDescription] = getPageMetadata(location.pathname);
  usePageMetadata(pageTitle, pageDescription);
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/");
    },
  });
  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brandMark}>WS</div>
        <div className={styles.brandText}>
          <Text variant="header-1">Веб-склад</Text>
        </div>
        <nav className={styles.nav} aria-label="Основная навигация">
          {session.roles.some((role) => ['admin', 'warehouse', 'manager', 'finance'].includes(role)) && <Button
            view="flat-action" component={NavLink} to={routes.procurement}
            selected={location.pathname === routes.procurement}
          >Закупки</Button>}
          {session.roles.includes('admin') && <Button
            view="flat-action" component={NavLink} to={routes.audit}
            selected={location.pathname === routes.audit}
          >Журнал</Button>}
          <Button
            view="flat-action"
            component={NavLink}
            to={routes.productionPlans}
            selected={location.pathname === routes.productionPlans}
          >
            Планирование
          </Button>
          <Button
            view="flat-action"
            component={NavLink}
            to={routes.processes}
            selected={location.pathname.startsWith(routes.processes)}
          >
            Техпроцессы
          </Button>
          <Button
            view="flat-action"
            component={NavLink}
            to={routes.warehouse}
            selected={location.pathname.startsWith(routes.warehouse)}
          >
            Склад
          </Button>
          <Button
            view="flat-action"
            component={NavLink}
            to={routes.operations}
            selected={location.pathname === routes.operations}
          >
            Операции
          </Button>
          <Button
            view="flat-action"
            component={NavLink}
            to={routes.personnel}
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
        <div className={styles.user}>
          <Icon data={Person} size={18} />
          <Text ellipsis>{session.username}</Text>
          <Button
            view="flat"
            loading={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            aria-label="Выйти"
            title="Выйти"
          >
            <Icon data={ArrowRightFromSquare} />
          </Button>
        </div>
      </header>
      <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}>
        <Routes>
          <Route path={routes.procurement} element={<ProcurementPage />} />
          <Route path={routes.audit} element={<AuditPage />} />
          <Route
            path="/"
            element={<Navigate to={routes.productionPlans} replace />}
          />
          <Route
            path={routes.productionPlans}
            element={<ProductionPlansPage />}
          />
          <Route path={routes.warehouse} element={<WarehousePage />} />
          <Route path={routes.stockRevision} element={<StockRevisionPage />} />
          <Route path={routes.operations} element={<OperationsPage />} />
          <Route
            path={routes.operationInstructionPattern}
            element={<OperationInstructionPage />}
          />
          <Route
            path={routes.processes}
            element={<TechnologicalProcessesPage />}
          />
          <Route
            path={routes.processPrompt}
            element={<ProcessPromptPage />}
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

function AuthenticatedApp() {
  const queryClient = useQueryClient();
  const sessionQuery = useAuthSessionQuery();
  useEffect(() => {
    const handleUnauthorized = () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.session });
    };
    window.addEventListener("webstorage:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("webstorage:unauthorized", handleUnauthorized);
  }, [queryClient]);

  if (sessionQuery.isPending) {
    return <div className={styles.fullPageLoader}>Проверяем доступ…</div>;
  }
  if (sessionQuery.isError) {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401) {
      return (
        <LoginPage
          onAuthenticated={(session) => {
            queryClient.clear();
            queryClient.setQueryData(authKeys.session, session);
          }}
        />
      );
    }
    return (
      <div className={styles.authError}>
        <Alert
          theme="danger"
          title="Не удалось проверить доступ"
          message={getErrorMessage(sessionQuery.error)}
          actions={<Button onClick={() => sessionQuery.refetch()}>Повторить</Button>}
        />
      </div>
    );
  }
  return <AppLayout session={sessionQuery.data} />;
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path={routes.publicInstructionPattern}
          element={
            <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}>
              <PublicInstructionPage />
            </Suspense>
          }
        />
        <Route path="*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export function App() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </AppProviders>
  );
}

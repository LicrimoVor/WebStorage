import {PersonalAppearance} from './providers/PersonalAppearance';
import {CircleQuestion} from "@gravity-ui/icons";
import { Alert, Button, Icon, PlaceholderContainer } from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
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
import {RouteMetadata} from './RouteMetadata';
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary/ErrorBoundary";

const SettingsPage = lazy(() => import("@/pages/BusinessPages").then((m) => ({default: m.SettingsPage})));
const ReceiptPage = lazy(() => import("@/pages/BusinessPages").then((m) => ({default: m.ReceiptPage})));
const RepairsPage = lazy(() => import("@/pages/BusinessPages").then((m) => ({default: m.RepairsPage})));
import {AppHeader} from "./AppHeader";
import {PageHelp} from '@/shared/ui/PageHelp';
import {canOpenPath, firstAvailablePath} from "@/shared/lib/access";
const HelpPage = lazy(() => import("@/pages/HelpPage/HelpPage").then((m) => ({default: m.HelpPage})));
const UsersPage = lazy(() => import("@/pages/UsersPage/UsersPage").then((m) => ({default: m.UsersPage})));
const TrashPage = lazy(() => import("@/pages/TrashPage/TrashPage").then((m) => ({default: m.TrashPage})));

import styles from "./App.module.scss";
import { AppProviders } from "./providers/AppProviders";

const WarehousePage = lazy(async () => {
  const module = await import("@/pages/WarehousePage");
  return { default: module.WarehousePage };
});
const ProfilePage = lazy(async () => {
  const module = await import("@/pages/ProfilePage");
  return { default: module.ProfilePage };
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

function AppLayout({ session }: { session: AuthSession }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/");
    },
  });
  return (
    <div className={styles.app}>
      <RouteMetadata pathname={location.pathname} search={location.search} />
      <PersonalAppearance key={session.username} username={session.username} />
      <AppHeader access={session} username={session.username} pending={logoutMutation.isPending} onLogout={() => logoutMutation.mutate()} />
      {!canOpenPath(session, location.pathname) ? <main className={styles.authError}><Alert theme="warning" title="Нет доступа к разделу" message="Обратитесь к администратору, чтобы получить нужные права." actions={<Button onClick={() => navigate(firstAvailablePath(session))}>Открыть доступный раздел</Button>} /></main> : <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}>
        <Routes>
          <Route path="/help/:chapterId?" element={<HelpPage />} />
          <Route path="/settings/users" element={<UsersPage />} />
          <Route path="/settings/trash" element={<TrashPage />} />
          <Route path={routes.profile} element={<ProfilePage />} />
          <Route path={routes.procurement} element={<Navigate to="/warehouse/receipt" replace />} />
          <Route path="/production" element={<Navigate to="/production-plans?tab=release" replace />} />
          <Route path="/repairs" element={<RepairsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/warehouse/receipt" element={<ReceiptPage />} />
          <Route path="/audit" element={<Navigate to="/settings/audit" replace />} />
          <Route path={routes.audit} element={<AuditPage />} />
          <Route
            path="/"
            element={<Navigate to={firstAvailablePath(session)} replace />}
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
      </Suspense>}
    </div>
  );
}

function AuthenticatedApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useAuthSessionQuery();
  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.removeQueries({predicate: (query) => query.queryKey[0] !== "auth"});
      queryClient.removeQueries({queryKey: authKeys.profile});
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
      if (location.pathname === '/help' || location.pathname.startsWith('/help/')) {
        return <><header className={styles.topbar}><Button onClick={() => navigate('/')}>Войти в Веб-склад</Button><PageHelp /></header>
          <Suspense fallback={<div className={styles.routeLoader}>Загрузка…</div>}><Routes><Route path="/help/:chapterId?" element={<HelpPage />} /></Routes></Suspense></>;
      }
      return (
        <LoginPage
          onAuthenticated={(session) => {
            queryClient.removeQueries({predicate: (query) =>
              query.queryKey[0] !== "auth" || query.queryKey[1] !== "session"});
            queryClient.setQueryData(authKeys.session, session);
            navigate(firstAvailablePath(session), {replace: true});
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

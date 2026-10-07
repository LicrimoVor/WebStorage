import {InstallAppButton} from './InstallAppButton';
import {
  ArrowRightFromSquare,
  Gear,
  Person,
  Calendar,
  Boxes3,
  Persons,
  ShoppingCart,
  ChartColumn,
  Wrench,
  ListCheck,
  Circles4Square,
  Bars,
  Xmark,
  CircleQuestion,
} from "@gravity-ui/icons";
import { Button, Icon, Modal, Text } from "@gravity-ui/uikit";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { routes } from "@/shared/routes";
import { canOpenPath, type Access } from "@/shared/lib/access";
import { PageHelp } from "@/shared/ui/PageHelp";
import { ThemeToggle } from "./providers/ThemeToggle";
import styles from "./App.module.scss";

export function AppHeader({
  username,
  pending,
  onLogout,
  access = { roles: ["admin"] },
}: {
  access?: Access;
  username: string;
  pending: boolean;
  onLogout: () => void;
}) {
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState<string>();
  const open = openedAt === location.key;
  const close = () => setOpenedAt(undefined);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1101px)");
    const onResize = () => {
      if (media.matches) setOpenedAt(undefined);
    };
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);
  const navigation = (
    <nav className={styles.nav} aria-label="Основная навигация">
      {[
        { path: routes.productionPlans, label: "Планирование", icon: Calendar },
        { path: routes.processes, label: "Техпроцессы", icon: Circles4Square },
        { path: routes.warehouse, label: "Склад", icon: Boxes3 },
        { path: routes.operations, label: "Операции", icon: ListCheck },
        { path: routes.personnel, label: "Персонал", icon: Persons },
        { path: "/repairs", label: "Ремонт", icon: Wrench },
        { path: routes.sales, label: "Продажа", icon: ShoppingCart },
        { path: routes.finance, label: "Финансы", icon: ChartColumn },
      ]
        .filter(({ path }) => canOpenPath(access, path))
        .map(({ path, label, icon }) => (
          <Button
            key={path}
            view="flat-action"
            component={NavLink}
            to={path}
            selected={location.pathname.startsWith(path)}
          >
            <Icon data={icon} size={18} />
            {label}
          </Button>
        ))}
    </nav>
  );
  const userActions = (
    <div className={styles.user}>
      <InstallAppButton />
      {canOpenPath(access, "/settings") && (
        <Button
          view="flat"
          component={NavLink}
          to="/settings"
          selected={location.pathname.startsWith("/settings")}
          aria-label="Настройки"
          title="Настройки"
        >
          <Icon data={Gear} size={18} />
        </Button>
      )}
      <Button
        view="flat"
        component={NavLink}
        to="/help"
        aria-label="Инструкция пользователя"
        title="Инструкция пользователя"
      >
        <Icon data={CircleQuestion} size={20} />
      </Button>
      <ThemeToggle />
      <Button
        view="flat"
        component={NavLink}
        to={routes.profile}
        selected={location.pathname === routes.profile}
        aria-label="Профиль пользователя"
        title={`Профиль: ${username}`}
      >
        <Icon data={Person} size={18} />
      </Button>
      <Button
        view="flat"
        loading={pending}
        onClick={onLogout}
        aria-label="Выйти"
        title="Выйти"
      >
        <Icon data={ArrowRightFromSquare} />
      </Button>
    </div>
  );
  return (
    <>
      <header className={styles.topbar}>
        <Button
          className={styles.menuToggle}
          view="flat"
          size="xl"
          aria-label="Открыть меню"
          aria-expanded={open}
          aria-controls={open ? "mobile-navigation" : undefined}
          onClick={() => setOpenedAt(location.key)}
        >
          <Icon data={Bars} size={22} />
        </Button>
        <div className={styles.brandMark}>WS</div>
        <div className={styles.brandText}>
          <Text variant="header-1">Веб-склад</Text>
        </div>
        <PageHelp />
        <div className={styles.desktopNavigation}>
          {navigation}
          {userActions}
        </div>
      </header>
      <Modal
        open={open}
        onClose={close}
        aria-label="Меню навигации"
        className={styles.drawerOverlay}
        contentClassName={styles.drawer}
        contentOverflow="auto"
      >
        <div id="mobile-navigation" className={styles.drawerInner}>
          <div className={styles.drawerHeading}>
            <Text variant="header-1">Веб-склад</Text>
            <Button
              size="xl"
              view="flat"
              aria-label="Закрыть меню"
              onClick={close}
            >
              <Icon data={Xmark} size={22} />
            </Button>
          </div>
          <div
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) close();
            }}
          >
            {navigation}
          </div>
          <div className={styles.drawerAccount}>
            <Text color="secondary">{username}</Text>
            {userActions}
          </div>
        </div>
      </Modal>
    </>
  );
}

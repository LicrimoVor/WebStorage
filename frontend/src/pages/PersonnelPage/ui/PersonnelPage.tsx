import { Text } from "@gravity-ui/uikit";

import { EmployeesTableWidget } from "@/widgets/EmployeesTable";

import styles from "./PersonnelPage.module.scss";

export function PersonnelPage() {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Text as="h1" variant="display-1">
          Персонал
        </Text>
      </header>
      <EmployeesTableWidget />
    </main>
  );
}

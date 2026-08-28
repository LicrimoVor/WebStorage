import { Text } from "@gravity-ui/uikit";

import { OperationsTableWidget } from "@/widgets/OperationsTable";

import styles from "./OperationsPage.module.scss";

export function OperationsPage() {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Text as="h1" variant="display-1">
          Операции
        </Text>
      </header>
      <OperationsTableWidget />
    </main>
  );
}

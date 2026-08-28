import { Text } from "@gravity-ui/uikit";

import { TechnologicalProcessesWidget } from "@/widgets/TechnologicalProcesses";

import styles from "./TechnologicalProcessesPage.module.scss";

export function TechnologicalProcessesPage() {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Text as="h1" variant="display-1">
          Техпроцессы
        </Text>
      </header>
      <TechnologicalProcessesWidget />
    </main>
  );
}

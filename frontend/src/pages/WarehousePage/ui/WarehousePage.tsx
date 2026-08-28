import {Text} from '@gravity-ui/uikit';

import {MaterialsTableWidget} from '@/widgets/MaterialsTable';

import styles from './WarehousePage.module.scss';

export function WarehousePage() {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">
            Склад
          </Text>
          <Text as="p" color="secondary" className={styles.description}>
            Материалы, доступные остатки и прозрачная история движений
          </Text>
        </div>
      </header>
      <MaterialsTableWidget />
    </main>
  );
}


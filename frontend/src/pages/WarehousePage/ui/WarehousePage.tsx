import { Text } from "@gravity-ui/uikit";

import { MaterialsTableWidget } from "@/widgets/MaterialsTable";
import { ManufacturedItemsTableWidget } from "@/widgets/ManufacturedItemsTable";

import styles from "./WarehousePage.module.scss";

export function WarehousePage() {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">
            Склад
          </Text>
        </div>
      </header>
      <div className={styles.sections}>
        <MaterialsTableWidget />
        <ManufacturedItemsTableWidget />
      </div>
    </main>
  );
}

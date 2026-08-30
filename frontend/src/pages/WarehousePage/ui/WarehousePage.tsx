import { Button, Text } from "@gravity-ui/uikit";
import { useNavigate } from "react-router-dom";

import { MaterialsTableWidget } from "@/widgets/MaterialsTable";
import { ManufacturedItemsTableWidget } from "@/widgets/ManufacturedItemsTable";
import { ManageInventoryGroupsButton } from "@/features/ManageInventoryGroups";
import { routes } from "@/shared/routes";

import styles from "./WarehousePage.module.scss";

export function WarehousePage() {
  const navigate = useNavigate();
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">
            Склад
          </Text>
        </div>
        <div className={styles.actions}>
          <ManageInventoryGroupsButton />
          <Button view="action" size="l" onClick={() => navigate(routes.stockRevision)}>
            Ревизия
          </Button>
        </div>
      </header>
      <div className={styles.sections}>
        <MaterialsTableWidget />
        <ManufacturedItemsTableWidget />
      </div>
    </main>
  );
}

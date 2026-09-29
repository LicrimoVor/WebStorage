import {GroupTree} from '@/shared/ui/GroupTree';
import { Alert } from "@gravity-ui/uikit";
import { ImportCatalogButton } from "@/features/ImportCatalog/ImportCatalogButton";
import { useSearchParams } from "react-router-dom";
import { OperationsTableWidget } from "@/widgets/OperationsTable";
import { useOperationGroupsQuery } from "@/entities/OperationGroup/api";
import { ManageOperationGroups } from "@/entities/OperationGroup/ManageOperationGroups";
import { getErrorMessage } from "@/shared/api";
import styles from "@/pages/BusinessPages/BusinessPages.module.scss";

export function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const groups = useOperationGroupsQuery();
  const current = params.get("group_id") ?? "";
  const select = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("group_id", value);
    else next.delete("group_id");
    next.set("page", "1");
    setParams(next);
  };
  return (
    <main className={styles.page}>
      <header className={styles.row}>
        <h1>Операции</h1>
        <ImportCatalogButton kind="operations" />
        <ManageOperationGroups />
      </header>
      <div className={styles.warehouse}>
        <aside className={styles.sidebar} aria-label="Группы операций">
          <GroupTree groups={groups.data ?? []} selected={current} onSelect={select} allLabel={"\u0412\u0441\u0435 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438"} ungrouped />
          {groups.isError && (
            <Alert theme="danger" message={getErrorMessage(groups.error)} />
          )}
        </aside>
        <OperationsTableWidget />
      </div>
    </main>
  );
}

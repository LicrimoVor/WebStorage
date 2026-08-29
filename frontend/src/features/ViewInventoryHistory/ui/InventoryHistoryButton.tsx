import {
  Alert,
  Button,
  Dialog,
  Pagination,
  PlaceholderContainer,
  Spin,
  Table,
  type TableColumnConfig,
} from "@gravity-ui/uikit";
import { Archive } from "@gravity-ui/icons";
import { useState } from "react";

import {
  useInventoryMovementsQuery,
  type InventoryMovement,
  type Material,
} from "@/entities/Material";
import { ExportExcelButton } from "@/features/ExportExcel";
import { getErrorMessage } from "@/shared/api";
import { formatDateTime, formatDecimal } from "@/shared/lib";

import styles from "./InventoryHistoryButton.module.scss";

const labels: Record<string, string> = {
  receipt: "Приход",
  consumption: "Расход",
  production: "Производство",
  sale: "Продажа",
  adjustment: "Корректировка",
  write_off: "Списание",
};

const columns: TableColumnConfig<InventoryMovement>[] = [
  {
    id: "created_at",
    name: "Дата",
    template: (item) => formatDateTime(item.created_at),
  },
  {
    id: "movement_type",
    name: "Тип",
    template: (item) => labels[item.movement_type] ?? item.movement_type,
  },
  {
    id: "quantity",
    name: "Изменение",
    align: "end",
    template: (item) => formatDecimal(item.quantity),
  },
  {
    id: "balance_before",
    name: "До",
    align: "end",
    template: (item) => formatDecimal(item.balance_before),
  },
  {
    id: "balance_after",
    name: "После",
    align: "end",
    template: (item) => formatDecimal(item.balance_after),
  },
  { id: "comment", name: "Комментарий" },
];

interface InventoryHistoryButtonProps {
  material: Material;
}

export function InventoryHistoryButton({
  material,
}: InventoryHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const titleId = `inventory-history-${material.id}`;
  const query = useInventoryMovementsQuery(material.id, page, pageSize, open);

  return (
    <>
      <Button view="flat-secondary" size="s" onClick={() => setOpen(true)}>
        История
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        maxWidth="l"
        fullWidth
        contentOverflow="auto"
      >
        <Dialog.Header caption={`История: ${material.name}`} id={titleId} />
        <Dialog.Body>
          {query.isPending ? (
            <div className={styles.center} aria-label="Загрузка истории">
              <Spin size="l" />
            </div>
          ) : query.isError ? (
            <Alert
              theme="danger"
              title="Не удалось загрузить историю"
              message={getErrorMessage(query.error)}
              actions={
                <Button onClick={() => query.refetch()}>Повторить</Button>
              }
            />
          ) : query.data.items.length === 0 ? (
            <PlaceholderContainer
              image={<Archive />}
              title="Движений пока нет"
              description="Первое изменение остатка появится здесь."
            />
          ) : (
            <div className={styles.content}>
              <div className={styles.tableWrap}>
                <Table
                  data={query.data.items}
                  className={styles.table}
                  columns={columns}
                  getRowId={(item) => item.id}
                  verticalAlign="middle"
                />
              </div>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={query.data.total}
                onUpdate={setPage}
                compact
              />
            </div>
          )}
          <ExportExcelButton
            dataset="inventory_movements"
            params={{ material_id: material.id }}
            label="История в Excel"
            size="m"
          />
        </Dialog.Body>
        <Dialog.Footer
          textButtonCancel="Закрыть"
          onClickButtonCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

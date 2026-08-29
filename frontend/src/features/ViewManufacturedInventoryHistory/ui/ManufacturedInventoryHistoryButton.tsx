import {Archive} from '@gravity-ui/icons';
import {
  Alert,
  Button,
  Dialog,
  Pagination,
  PlaceholderContainer,
  Spin,
  Table,
  type TableColumnConfig,
} from '@gravity-ui/uikit';
import {useState} from 'react';

import {
  useManufacturedItemMovementsQuery,
  type ManufacturedItem,
  type ManufacturedItemMovement,
} from '@/entities/ManufacturedItem';
import {ExportExcelButton} from '@/features/ExportExcel';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime, formatDecimal} from '@/shared/lib';

import styles from './ManufacturedInventoryHistoryButton.module.scss';

const labels: Record<string, string> = {
  receipt: 'Приход',
  consumption: 'Расход',
  production: 'Производство',
  sale: 'Продажа',
  adjustment: 'Корректировка',
  write_off: 'Списание',
};

const columns: TableColumnConfig<ManufacturedItemMovement>[] = [
  {
    id: 'created_at',
    name: 'Дата',
    template: (item) => formatDateTime(item.created_at),
  },
  {
    id: 'movement_type',
    name: 'Тип',
    template: (item) => labels[item.movement_type] ?? item.movement_type,
  },
  {
    id: 'quantity',
    name: 'Изменение',
    align: 'end',
    template: (item) => formatDecimal(item.quantity),
  },
  {
    id: 'balance_before',
    name: 'До',
    align: 'end',
    template: (item) => formatDecimal(item.balance_before),
  },
  {
    id: 'balance_after',
    name: 'После',
    align: 'end',
    template: (item) => formatDecimal(item.balance_after),
  },
  {id: 'comment', name: 'Комментарий'},
];

interface ManufacturedInventoryHistoryButtonProps {
  item: ManufacturedItem;
}

export function ManufacturedInventoryHistoryButton({
  item,
}: ManufacturedInventoryHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const titleId = `manufactured-inventory-history-${item.id}`;
  const query = useManufacturedItemMovementsQuery(item.id, page, pageSize, open);

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
        <Dialog.Header caption={`История: ${item.name}`} id={titleId} />
        <Dialog.Body>
          {query.isPending ? (
            <div className={styles.center} aria-label="Загрузка истории позиции">
              <Spin size="l" />
            </div>
          ) : query.isError ? (
            <Alert
              theme="danger"
              title="Не удалось загрузить историю"
              message={getErrorMessage(query.error)}
              actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
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
                  columns={columns}
                  getRowId={(movement) => movement.id}
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
            params={{product_id: item.id}}
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

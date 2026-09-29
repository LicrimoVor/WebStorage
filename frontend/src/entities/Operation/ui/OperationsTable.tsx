import {Button, Table, type TableColumnConfig} from '@gravity-ui/uikit';

import {formatDecimal, formatMoney} from '@/shared/lib';

import type {Operation} from '../model/types';
import styles from './OperationsTable.module.scss';

interface OperationsTableProps {
  items: Operation[];
  onSelect: (operation: Operation) => void;
}

export function OperationsTable({items, onSelect}: OperationsTableProps) {
  const columns: TableColumnConfig<Operation>[] = [
    {
      id: 'name',
      name: 'Название',
      primary: true,
      template: (item) => <Button view="flat" onClick={() => onSelect(item)}>{item.name}</Button>,
    },
    {
      id: 'required_quantity',
      name: 'Необходимо',
      align: 'center',
      template: (item) => formatDecimal(item.required_quantity),
    },
    {
      id: 'time_norm',
      name: 'Норма времени',
      align: 'center',
      template: (item) =>
        item.time_norm ? `${formatDecimal(item.time_norm)} мин.` : '—',
    },
    {
      id: 'required_time_minutes',
      name: 'Необходимое время',
      align: 'center',
      template: (item) => `${formatDecimal(item.required_time_minutes)} мин.`,
    },
    {
      id: 'price_per_operation',
      name: 'Ставка',
      align: 'center',
      template: (item) => formatMoney(item.price_per_operation),
    },
    {
      id: 'completed_quantity',
      name: 'Выполнено',
      align: 'center',
      template: (item) => formatDecimal(item.completed_quantity),
    },
  ];
  return (
    <div className={styles.scrollArea}>
      <Table
        className={styles.table}
        data={items}
        columns={columns}
        getRowId={(item) => item.id}
        verticalAlign="middle"
        onRowClick={(item, _index, event) => {
          if (!(event.target as HTMLElement).closest('button')) onSelect(item);
        }}
      />
    </div>
  );
}

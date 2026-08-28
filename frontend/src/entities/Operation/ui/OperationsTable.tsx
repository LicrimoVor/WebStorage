import {Table, Text, type TableColumnConfig} from '@gravity-ui/uikit';
import type {ReactNode} from 'react';

import {formatDecimal, formatMoney} from '@/shared/lib';

import type {Operation} from '../model/types';
import styles from './OperationsTable.module.scss';

interface OperationsTableProps {
  items: Operation[];
  renderActions: (operation: Operation) => ReactNode;
}

export function OperationsTable({items, renderActions}: OperationsTableProps) {
  const columns: TableColumnConfig<Operation>[] = [
    {
      id: 'name',
      name: 'Название',
      primary: true,
      template: (item) => <Text variant="body-2">{item.name}</Text>,
    },
    {
      id: 'required_quantity',
      name: 'Необходимо',
      align: 'end',
      template: (item) => formatDecimal(item.required_quantity),
    },
    {
      id: 'time_norm',
      name: 'Норма времени',
      align: 'end',
      template: (item) =>
        item.time_norm ? `${formatDecimal(item.time_norm)} мин.` : '—',
    },
    {
      id: 'required_time_minutes',
      name: 'Необходимое время',
      align: 'end',
      template: (item) => `${formatDecimal(item.required_time_minutes)} мин.`,
    },
    {
      id: 'price_per_operation',
      name: 'Ставка',
      align: 'end',
      template: (item) => formatMoney(item.price_per_operation),
    },
    {
      id: 'completed_quantity',
      name: 'Выполнено',
      align: 'end',
      template: (item) => formatDecimal(item.completed_quantity),
    },
    {
      id: 'actions',
      name: 'Действия',
      sticky: 'end',
      template: renderActions,
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
      />
    </div>
  );
}

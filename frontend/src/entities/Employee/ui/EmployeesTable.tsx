import {Label, Table, Text, type TableColumnConfig} from '@gravity-ui/uikit';
import type {ReactNode} from 'react';

import {formatDecimal, formatMoney} from '@/shared/lib';

import type {Employee} from '../model/types';
import styles from './EmployeesTable.module.scss';

interface EmployeesTableProps {
  items: Employee[];
  renderActions: (employee: Employee) => ReactNode;
}

export function EmployeesTable({items, renderActions}: EmployeesTableProps) {
  const columns: TableColumnConfig<Employee>[] = [
    {
      id: 'full_name',
      name: 'ФИО',
      primary: true,
      template: (item) => <Text variant="body-2">{item.full_name}</Text>,
    },
    {
      id: 'compensation_type',
      name: 'Оплата',
      template: (item) => (
        <div>
          <Text>{item.compensation_type === 'hourly' ? 'Почасовая' : 'Сдельная'}</Text>
          {item.hourly_rate ? (
            <Text as="div" color="secondary" variant="caption-2">
              {formatMoney(item.hourly_rate)} / ч
            </Text>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      name: 'Статус',
      template: (item) => (
        <Label theme={item.active ? 'success' : 'normal'}>
          {item.active ? 'Активен' : 'Неактивен'}
        </Label>
      ),
    },
    {
      id: 'accrued_total',
      name: 'Начислено',
      align: 'end',
      template: (item) => formatMoney(item.accrued_total),
    },
    {
      id: 'paid_total',
      name: 'Оплачено',
      align: 'end',
      template: (item) => formatMoney(item.paid_total),
    },
    {
      id: 'payable_total',
      name: 'К оплате',
      align: 'end',
      template: (item) => formatMoney(item.payable_total),
    },
    {
      id: 'completed_operations',
      name: 'Выполнено, экв.',
      align: 'end',
      template: (item) => formatDecimal(item.completed_operations),
    },
    {
      id: 'paid_operations_equivalent',
      name: 'Оплачено, экв.',
      align: 'end',
      template: (item) => formatDecimal(item.paid_operations_equivalent),
    },
    {id: 'comment', name: 'Комментарий', template: (item) => item.comment ?? '—'},
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

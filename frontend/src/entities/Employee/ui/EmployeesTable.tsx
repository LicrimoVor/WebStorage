import {Label, Table, Text, type TableColumnConfig} from '@gravity-ui/uikit';

import {formatDecimal, formatMoney} from '@/shared/lib';

import type {Employee} from '../model/types';
import styles from './EmployeesTable.module.scss';

interface EmployeesTableProps {
  items: Employee[];
  onSelect: (employee: Employee) => void;
}

export function EmployeesTable({items, onSelect}: EmployeesTableProps) {
  const columns: TableColumnConfig<Employee>[] = [
    {
      id: 'full_name',
      name: 'ФИО',
      primary: true,
      template: (item) => <button type="button" className={styles.name} onClick={() => onSelect(item)}>{item.full_name}</button>,
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
      align: 'center',
      template: (item) => formatMoney(item.accrued_total),
    },
    {
      id: 'paid_total',
      name: 'Оплачено',
      align: 'center',
      template: (item) => formatMoney(item.paid_total),
    },
    {
      id: 'payable_total',
      name: 'К оплате',
      align: 'center',
      template: (item) => formatMoney(item.payable_total),
    },
    {
      id: 'completed_operations',
      name: 'Выполнено, экв.',
      align: 'center',
      template: (item) => formatDecimal(item.completed_operations),
    },
    {
      id: 'paid_operations_equivalent',
      name: 'Оплачено, экв.',
      align: 'center',
      template: (item) => formatDecimal(item.paid_operations_equivalent),
    },
    {id: 'comment', name: 'Комментарий', template: (item) => item.comment ?? '—'},
  ];
  return (
    <div className={styles.scrollArea}>
      <Table
        className={styles.table}
        data={items}
        columns={columns}
        getRowId={(item) => item.id}
        verticalAlign="middle"
        onRowClick={(item, _, event) => {if (!(event.target as HTMLElement).closest('button, a')) onSelect(item);}}
      />
    </div>
  );
}

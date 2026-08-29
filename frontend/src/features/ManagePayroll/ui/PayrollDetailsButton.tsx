import {Archive} from '@gravity-ui/icons';
import {
  Alert,
  Button,
  Card,
  Dialog,
  Pagination,
  PlaceholderContainer,
  Spin,
  Table,
  Text,
  type TableColumnConfig,
} from '@gravity-ui/uikit';
import {useState} from 'react';

import type {Employee} from '@/entities/Employee';
import {
  useEmployeePaymentsQuery,
  useEmployeePayrollSummaryQuery,
  type EmployeeOperationSummary,
  type Payment,
} from '@/entities/WorkPayroll';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime, formatDecimal, formatMoney} from '@/shared/lib';

import styles from './PayrollButtons.module.scss';

const operationColumns: TableColumnConfig<EmployeeOperationSummary>[] = [
  {id: 'operation_name', name: 'Операция'},
  {
    id: 'completed_quantity',
    name: 'Выполнено',
    align: 'end',
    template: (item) => formatDecimal(item.completed_quantity),
  },
  {
    id: 'time_minutes',
    name: 'Минут',
    align: 'end',
    template: (item) => formatDecimal(item.time_minutes),
  },
  {
    id: 'accrued_amount',
    name: 'Начислено',
    align: 'end',
    template: (item) => formatMoney(item.accrued_amount),
  },
  {
    id: 'paid_amount',
    name: 'Оплачено',
    align: 'end',
    template: (item) => formatMoney(item.paid_amount),
  },
  {
    id: 'payable_amount',
    name: 'К оплате',
    align: 'end',
    template: (item) => formatMoney(item.payable_amount),
  },
];

const paymentColumns: TableColumnConfig<Payment>[] = [
  {
    id: 'paid_at',
    name: 'Дата',
    template: (item) => formatDateTime(item.paid_at),
  },
  {
    id: 'amount',
    name: 'Сумма',
    align: 'end',
    template: (item) => formatMoney(item.amount),
  },
  {
    id: 'allocation_mode',
    name: 'Распределение',
    template: (item) => (item.allocation_mode === 'fifo' ? 'FIFO' : 'Вручную'),
  },
  {
    id: 'allocations',
    name: 'Работы',
    template: (item) =>
      item.allocations
        .map((allocation) => `${allocation.operation_name}: ${formatMoney(allocation.amount)}`)
        .join(', '),
  },
  {id: 'comment', name: 'Комментарий', template: (item) => item.comment ?? '—'},
];

export function PayrollDetailsButton({employee}: {employee: Employee}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const summary = useEmployeePayrollSummaryQuery(employee.id, open);
  const payments = useEmployeePaymentsQuery(employee.id, page, open);
  return (
    <>
      <Button view="flat-secondary" size="s" onClick={() => setOpen(true)}>
        Расчёты
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="l"
        fullWidth
        contentOverflow="auto"
      >
        <Dialog.Header caption={`Расчёты с сотрудником: ${employee.full_name}`} />
        <Dialog.Body>
          {summary.isPending ? (
            <div className={styles.center} aria-label="Загрузка расчётов">
              <Spin size="l" />
            </div>
          ) : summary.isError ? (
            <Alert
              theme="danger"
              title="Не удалось загрузить расчёты"
              message={getErrorMessage(summary.error)}
            />
          ) : (
            <div className={styles.content}>
              <div className={styles.summary}>
                <Card className={styles.summaryCard} view="outlined">
                  <Text color="secondary">Начислено</Text>
                  <Text variant="header-1">{formatMoney(summary.data.accrued_total)}</Text>
                </Card>
                <Card className={styles.summaryCard} view="outlined">
                  <Text color="secondary">Оплачено</Text>
                  <Text variant="header-1">{formatMoney(summary.data.paid_total)}</Text>
                </Card>
                <Card className={styles.summaryCard} view="outlined">
                  <Text color="secondary">К оплате</Text>
                  <Text variant="header-1">{formatMoney(summary.data.payable_total)}</Text>
                </Card>
                <Card className={styles.summaryCard} view="outlined">
                  <Text color="secondary">Операций</Text>
                  <Text variant="header-1">
                    {formatDecimal(summary.data.completed_operations)}
                  </Text>
                </Card>
              </div>
              <section className={styles.section}>
                <Text as="h3" variant="subheader-2">
                  По операциям
                </Text>
                {summary.data.operations.length === 0 ? (
                  <PlaceholderContainer image={<Archive />} title="Начислений пока нет" />
                ) : (
                  <div className={styles.tableWrap}>
                    <Table
                      data={summary.data.operations}
                      columns={operationColumns}
                      getRowId={(item) => item.operation_id}
                      verticalAlign="middle"
                    />
                  </div>
                )}
              </section>
              <section className={styles.section}>
                <Text as="h3" variant="subheader-2">
                  Выплаты
                </Text>
                {payments.isError ? (
                  <Alert theme="danger" message={getErrorMessage(payments.error)} />
                ) : payments.data?.items.length ? (
                  <>
                    <div className={styles.tableWrap}>
                      <Table
                        data={payments.data.items}
                        columns={paymentColumns}
                        getRowId={(item) => item.id}
                        verticalAlign="middle"
                      />
                    </div>
                    <Pagination
                      page={page}
                      pageSize={10}
                      total={payments.data.total}
                      onUpdate={setPage}
                      compact
                    />
                  </>
                ) : (
                  <PlaceholderContainer image={<Archive />} title="Выплат пока нет" />
                )}
              </section>
            </div>
          )}
        </Dialog.Body>
        <Dialog.Footer
          textButtonCancel="Закрыть"
          onClickButtonCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

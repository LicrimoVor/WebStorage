import {FundingSelect} from '@/entities/Funding';
import {
  Alert,
  Button,
  Dialog,
  Switch,
  Table,
  TextInput,
  type TableColumnConfig,
} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useMemo, useState} from 'react';

import {employeeKeys, type Employee} from '@/entities/Employee';
import {
  createEmployeePayment,
  useEmployeeWorkEntriesQuery,
  workPayrollKeys,
  type PaymentCreate,
  type WorkEntry,
} from '@/entities/WorkPayroll';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime, formatMoney, normalizeDecimal} from '@/shared/lib';

import styles from './PayrollButtons.module.scss';

function currentDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function isMoney(value: string): boolean {
  return /^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) && Number(normalizeDecimal(value)) > 0;
}

interface RegisterPaymentButtonProps {
  employee: Employee;
}

export function RegisterPaymentButton({employee}: RegisterPaymentButtonProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(currentDateTime);
  const [comment, setComment] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [manual, setManual] = useState(false);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const works = useEmployeeWorkEntriesQuery(employee.id, 1, open && manual, 100);
  const outstanding = useMemo(
    () =>
      (works.data?.items ?? []).filter(
        (entry) => Number(entry.payable_amount) > 0 && entry.voided_at === null,
      ),
    [works.data?.items],
  );
  const mutation = useMutation({
    mutationFn: (payload: PaymentCreate) => createEmployeePayment(employee.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workPayrollKeys.all}),
        queryClient.invalidateQueries({queryKey: employeeKeys.all}),
      ]);
      setOpen(false);
      setAmount('');
      setComment('');
      setAllocationAmounts({});
    },
  });
  const openDialog = () => {
    setAmount(Number(employee.payable_total) > 0 ? employee.payable_total : '');
    setPaidAt(currentDateTime());
    setManual(false);
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    if (!fundingSource) {setValidationError("Выберите источник финансирования."); return;}
    if (!isMoney(amount)) {
      setValidationError('Укажите положительную сумму с точностью до копеек.');
      return;
    }
    if (!paidAt) {
      setValidationError('Укажите дату выплаты.');
      return;
    }
    let allocations: PaymentCreate['allocations'] = null;
    if (manual) {
      allocations = outstanding
        .filter((entry) => isMoney(allocationAmounts[entry.id] ?? ''))
        .map((entry) => ({
          work_entry_id: entry.id,
          amount: normalizeDecimal(allocationAmounts[entry.id] ?? ''),
        }));
      const allocatedCents = allocations.reduce(
        (sum, item) => sum + Math.round(Number(item.amount) * 100),
        0,
      );
      if (allocatedCents !== Math.round(Number(normalizeDecimal(amount)) * 100)) {
        setValidationError('Сумма ручных распределений должна совпадать с выплатой.');
        return;
      }
      if (allocations.length === 0) {
        setValidationError('Распределите выплату хотя бы на одну работу.');
        return;
      }
    }
    setValidationError(undefined);
    mutation.mutate({
      amount: normalizeDecimal(amount),
      paid_at: new Date(paidAt).toISOString(),
      comment: comment.trim() || null,
      funding_source_id: fundingSource,
      allocations,
    });
  };
  const allocationColumns: TableColumnConfig<WorkEntry>[] = [
    {id: 'operation_name', name: 'Операция'},
    {
      id: 'performed_at',
      name: 'Выполнено',
      template: (entry) => formatDateTime(entry.performed_at),
    },
    {
      id: 'payable_amount',
      name: 'Остаток',
      align: 'end',
      template: (entry) => formatMoney(entry.payable_amount),
    },
    {
      id: 'allocation',
      name: 'Оплатить',
      template: (entry) => (
        <TextInput
          value={allocationAmounts[entry.id] ?? ''}
          onUpdate={(value) =>
            setAllocationAmounts((current) => ({...current, [entry.id]: value}))
          }
          controlProps={{inputMode: 'decimal', 'aria-label': `Оплатить ${entry.operation_name}`}}
          placeholder="0,00"
          size="m"
        />
      ),
    },
  ];
  return (
    <>
      <Button
        view="flat-action"
        size="s"
        onClick={openDialog}
        disabled={Number(employee.payable_total) <= 0}
      >
        Выплатить
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={() => {
          if (!manual) submit();
        }}
        maxWidth={manual ? 'l' : 's'}
        fullWidth
        contentOverflow="auto"
      >
        <Dialog.Header caption={`Выплата: ${employee.full_name}`} />
        <Dialog.Body>
          <div className={styles.form}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <Alert
              theme="info"
              view="outlined"
              message={`Доступно к выплате: ${formatMoney(employee.payable_total)}`}
            />
            <TextInput
              label="Сумма"
              value={amount}
              onUpdate={setAmount}
              controlProps={{inputMode: 'decimal', 'aria-label': 'Сумма выплаты'}}
              placeholder="0,00"
              size="l"
              autoFocus
            />
            <label className={styles.nativeField}>
              <span>Дата выплаты</span>
              <input
                className={styles.nativeInput}
                type="datetime-local"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </label>
            <FundingSelect value={fundingSource} onChange={setFundingSource} />
            <TextInput label="Комментарий" value={comment} onUpdate={setComment} size="l" />
            <Switch checked={manual} onUpdate={setManual} size="l">
              Распределить вручную
            </Switch>
            {manual ? (
              works.isError ? (
                <Alert theme="danger" message={getErrorMessage(works.error)} />
              ) : (
                <div className={styles.tableWrap}>
                  <Table
                    data={outstanding}
                    columns={allocationColumns}
                    getRowId={(entry) => entry.id}
                    verticalAlign="middle"
                  />
                </div>
              )
            ) : (
              <Alert
                theme="normal"
                view="outlined"
                message="По умолчанию сумма закроет самые старые неоплаченные работы (FIFO)."
              />
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Провести выплату"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

import {Alert, Button, Card, Dialog, Select, Text, TextInput} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useMemo, useState} from 'react';

import {employeeKeys, useEmployeesQuery} from '@/entities/Employee';
import {operationKeys, type Operation} from '@/entities/Operation';
import {
  createWorkEntry,
  workPayrollKeys,
  type WorkEntryCreate,
  type WorkInputMode,
} from '@/entities/WorkPayroll';
import {getErrorMessage} from '@/shared/api';
import {formatFixedDecimal, isDecimal, normalizeDecimal} from '@/shared/lib';

import styles from './RecordWorkButton.module.scss';

const modeOptions: Array<{value: WorkInputMode; content: string}> = [
  {value: 'quantity', content: 'По количеству'},
  {value: 'time', content: 'По затраченному времени'},
];

function currentDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

interface RecordWorkButtonProps {
  operation: Operation;
}

export function RecordWorkButton({operation}: RecordWorkButtonProps) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [mode, setMode] = useState<WorkInputMode>('quantity');
  const [value, setValue] = useState('');
  const [performedAt, setPerformedAt] = useState(currentDateTime);
  const [comment, setComment] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const employees = useEmployeesQuery({
    page: 1,
    page_size: 100,
    include_inactive: false,
    sort_by: 'full_name',
    sort_order: 'asc',
  });
  const mutation = useMutation({
    mutationFn: (payload: WorkEntryCreate) => createWorkEntry(operation.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workPayrollKeys.all}),
        queryClient.invalidateQueries({queryKey: operationKeys.all}),
        queryClient.invalidateQueries({queryKey: employeeKeys.all}),
      ]);
      setOpen(false);
      setValue('');
      setComment('');
    },
  });
  const estimate = useMemo(() => {
    if (!isDecimal(value) || Number(normalizeDecimal(value)) <= 0) return null;
    const input = Number(normalizeDecimal(value));
    const norm = operation.time_norm === null ? null : Number(operation.time_norm);
    const rate =
      operation.price_per_operation === null
        ? null
        : Number(operation.price_per_operation);
    const equivalent = mode === 'quantity' ? input : norm ? input / norm : null;
    const accrued = equivalent !== null && rate !== null ? equivalent * rate : null;
    return {equivalent, accrued};
  }, [mode, operation.price_per_operation, operation.time_norm, value]);

  const openDialog = () => {
    setValidationError(undefined);
    mutation.reset();
    setPerformedAt(currentDateTime());
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    if (!employeeId) {
      setValidationError('Выберите сотрудника.');
      return;
    }
    if (!isDecimal(value) || Number(normalizeDecimal(value)) <= 0) {
      setValidationError('Укажите положительное значение с точностью до 6 знаков.');
      return;
    }
    if (!performedAt) {
      setValidationError('Укажите дату выполнения.');
      return;
    }
    setValidationError(undefined);
    mutation.mutate({
      employee_id: employeeId,
      input_mode: mode,
      input_value: normalizeDecimal(value),
      performed_at: new Date(performedAt).toISOString(),
      comment: comment.trim() || null,
    });
  };

  return (
    <>
      <Button view="flat-action" size="s" onClick={openDialog} disabled={operation.archived}>
        Записать работу
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        maxWidth="m"
        fullWidth
      >
        <Dialog.Header caption={`Выполненная операция: ${operation.name}`} />
        <Dialog.Body>
          <div className={styles.form}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <Select
              label="Сотрудник"
              options={(employees.data?.items ?? []).map((employee) => ({
                value: employee.id,
                content: employee.full_name,
              }))}
              value={employeeId ? [employeeId] : []}
              onUpdate={(values) => setEmployeeId(values[0] ?? '')}
              loading={employees.isPending}
              width="max"
              size="l"
              filterable
              aria-label="Сотрудник"
            />
            <Select
              label="Способ ввода"
              options={modeOptions}
              value={[mode]}
              onUpdate={(values) => setMode((values[0] as WorkInputMode) ?? 'quantity')}
              width="max"
              size="l"
              aria-label="Способ ввода работы"
            />
            <TextInput
              label={mode === 'quantity' ? 'Количество операций' : 'Затрачено минут'}
              value={value}
              onUpdate={setValue}
              controlProps={{'aria-label': 'Объём работы', inputMode: 'decimal'}}
              placeholder="0"
              size="l"
              autoFocus
            />
            <label className={styles.nativeField}>
              <span>Выполнено</span>
              <input
                className={styles.nativeInput}
                type="datetime-local"
                value={performedAt}
                onChange={(event) => setPerformedAt(event.target.value)}
              />
            </label>
            <TextInput
              label="Комментарий"
              value={comment}
              onUpdate={setComment}
              controlProps={{'aria-label': 'Комментарий к работе'}}
              size="l"
              hasClear
            />
            {mode === 'time' && operation.time_norm === null ? (
              <Alert
                theme="warning"
                message="В операции не задана норма времени: работа сохранится, но количество и начисление рассчитать нельзя."
              />
            ) : operation.price_per_operation === null ? (
              <Alert
                theme="warning"
                message="В операции не задана ставка: работа сохранится без начисления."
              />
            ) : null}
            {estimate ? (
              <div className={styles.preview}>
                <Card view="outlined" type="container">
                  <Text color="secondary">Эквивалент операций</Text>
                  <Text as="div" variant="subheader-2">
                    {estimate.equivalent === null
                      ? '—'
                      : formatFixedDecimal(estimate.equivalent, 2)}
                  </Text>
                </Card>
                <Card view="outlined" type="container">
                  <Text color="secondary">Будет начислено</Text>
                  <Text as="div" variant="subheader-2">
                    {estimate.accrued === null
                      ? '—'
                      : `${formatFixedDecimal(estimate.accrued, 2)} ₽`}
                  </Text>
                </Card>
              </div>
            ) : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Сохранить"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

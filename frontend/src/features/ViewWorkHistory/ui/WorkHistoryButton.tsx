import { Archive } from "@gravity-ui/icons";
import {
  Alert,
  Button,
  Dialog,
  Label,
  Pagination,
  PlaceholderContainer,
  Select,
  Spin,
  Table,
  TextInput,
  type TableColumnConfig,
} from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { employeeKeys, type Employee } from "@/entities/Employee";
import { operationKeys, type Operation } from "@/entities/Operation";
import {
  updateWorkEntry,
  useEmployeeWorkEntriesQuery,
  useOperationWorkEntriesQuery,
  voidWorkEntry,
  workPayrollKeys,
  type WorkEntry,
  type WorkEntryUpdate,
  type WorkInputMode,
} from "@/entities/WorkPayroll";
import { ExportExcelButton } from "@/features/ExportExcel";
import { getErrorMessage } from "@/shared/api";
import {
  formatDateTime,
  formatDecimal,
  formatMoney,
  isDecimal,
  normalizeDecimal,
} from "@/shared/lib";

import styles from "./WorkHistoryButton.module.scss";

const modeOptions: Array<{ value: WorkInputMode; content: string }> = [
  { value: "quantity", content: "По количеству" },
  { value: "time", content: "По времени" },
];

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function EditWorkEntryButton({ entry }: { entry: WorkEntry }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkInputMode>(entry.input_mode);
  const [value, setValue] = useState(entry.input_value);
  const [performedAt, setPerformedAt] = useState(() =>
    toLocalDateTime(entry.performed_at),
  );
  const [comment, setComment] = useState(entry.comment ?? "");
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: WorkEntryUpdate) =>
      updateWorkEntry(entry.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workPayrollKeys.all }),
        queryClient.invalidateQueries({ queryKey: operationKeys.all }),
        queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
      ]);
      setOpen(false);
    },
  });
  const openDialog = () => {
    setMode(entry.input_mode);
    setValue(entry.input_value);
    setPerformedAt(toLocalDateTime(entry.performed_at));
    setComment(entry.comment ?? "");
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    if (!isDecimal(value) || Number(normalizeDecimal(value)) <= 0) {
      setValidationError(
        "Укажите положительное значение с точностью до 6 знаков.",
      );
      return;
    }
    if (!performedAt) {
      setValidationError("Укажите дату выполнения.");
      return;
    }
    setValidationError(undefined);
    mutation.mutate({
      input_mode: mode,
      input_value: normalizeDecimal(value),
      performed_at: new Date(performedAt).toISOString(),
      comment: comment.trim() || null,
    });
  };
  return (
    <>
      <Button view="flat" size="s" onClick={openDialog}>
        Изменить
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        maxWidth="s"
        fullWidth
      >
        <Dialog.Header caption={`Изменить работу: ${entry.operation_name}`} />
        <Dialog.Body>
          <div className={styles.form}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <Select
              label="Способ ввода"
              options={modeOptions}
              value={[mode]}
              onUpdate={(values) =>
                setMode((values[0] as WorkInputMode) ?? mode)
              }
              width="max"
              size="l"
            />
            <TextInput
              label={
                mode === "quantity" ? "Количество операций" : "Затрачено минут"
              }
              value={value}
              onUpdate={setValue}
              controlProps={{
                inputMode: "decimal",
                "aria-label": "Объём работы",
              }}
              size="l"
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
              size="l"
            />
            <Alert
              theme="info"
              view="outlined"
              message="Расчёт сохранит ставку и норму времени, зафиксированные при создании записи."
            />
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

function VoidWorkEntryButton({ entry }: { entry: WorkEntry }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => voidWorkEntry(entry.id, reason.trim() || null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workPayrollKeys.all }),
        queryClient.invalidateQueries({ queryKey: operationKeys.all }),
        queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
      ]);
      setOpen(false);
    },
  });
  return (
    <>
      <Button view="flat-danger" size="s" onClick={() => setOpen(true)}>
        Удалить
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="s" fullWidth>
        <Dialog.Header caption="Удалить запись о работе?" />
        <Dialog.Body>
          <div className={styles.form}>
            <Alert
              theme="warning"
              message="Запись останется в аудите, но перестанет участвовать в итогах. Оплаченную запись удалить нельзя."
            />
            {mutation.error ? (
              <Alert theme="danger" message={getErrorMessage(mutation.error)} />
            ) : null}
            <TextInput
              label="Причина"
              value={reason}
              onUpdate={setReason}
              size="l"
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Удалить"
          textButtonCancel="Отмена"
          onClickButtonApply={() => mutation.mutate()}
          onClickButtonCancel={() => setOpen(false)}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

interface WorkHistoryButtonProps {
  operation?: Operation;
  employee?: Employee;
}

export function WorkHistoryButton({
  operation,
  employee,
}: WorkHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const operationQuery = useOperationWorkEntriesQuery(
    operation?.id ?? "",
    page,
    open && operation !== undefined,
  );
  const employeeQuery = useEmployeeWorkEntriesQuery(
    employee?.id ?? "",
    page,
    open && employee !== undefined,
  );
  const query = operation ? operationQuery : employeeQuery;
  const columns: TableColumnConfig<WorkEntry>[] = [
    {
      id: "performed_at",
      name: "Выполнено",
      template: (entry) => formatDateTime(entry.performed_at),
    },
    ...(operation
      ? [
          {
            id: "employee_name",
            name: "Сотрудник",
          } as TableColumnConfig<WorkEntry>,
        ]
      : [
          {
            id: "operation_name",
            name: "Операция",
          } as TableColumnConfig<WorkEntry>,
        ]),
    {
      id: "input_value",
      name: "Введено",
      align: "end",
      template: (entry) =>
        `${formatDecimal(entry.input_value)} ${entry.input_mode === "time" ? "мин." : "оп."}`,
    },
    {
      id: "equivalent_quantity",
      name: "Операций",
      align: "end",
      template: (entry) =>
        entry.equivalent_quantity === null
          ? "—"
          : formatDecimal(entry.equivalent_quantity),
    },
    {
      id: "accrued_amount",
      name: "Начислено",
      align: "end",
      template: (entry) =>
        entry.calculation_message ? (
          <Label theme="warning">Нет расчёта</Label>
        ) : (
          formatMoney(entry.accrued_amount)
        ),
    },
    {
      id: "paid_amount",
      name: "Оплачено",
      align: "end",
      template: (entry) => formatMoney(entry.paid_amount),
    },
    {
      id: "actions",
      name: "Действия",
      sticky: "end",
      template: (entry) =>
        entry.voided_at ? (
          <Label theme="unknown">Удалена</Label>
        ) : (
          <div className={styles.actions}>
            <EditWorkEntryButton entry={entry} />
            <VoidWorkEntryButton entry={entry} />
          </div>
        ),
    },
  ];
  const title = operation?.name ?? employee?.full_name ?? "";
  return (
    <>
      <Button view="flat-secondary" size="s" onClick={() => setOpen(true)}>
        История работ
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="l"
        fullWidth
        contentOverflow="auto"
      >
        <Dialog.Header caption={`Выполненные работы: ${title}`} />
        <Dialog.Body>
          {query.isPending ? (
            <div className={styles.center} aria-label="Загрузка истории работ">
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
              image={<Archive width={100} height={100} />}
              title="Выполненных работ пока нет"
              description="Новая запись появится здесь после сохранения операции."
            />
          ) : (
            <div className={styles.content}>
              <div className={styles.tableWrap}>
                <Table
                  className={styles.table}
                  data={query.data.items}
                  columns={columns}
                  getRowId={(entry) => entry.id}
                  getRowClassNames={(entry) =>
                    entry.voided_at ? [styles.voided] : []
                  }
                  verticalAlign="middle"
                />
              </div>
              <Pagination
                page={page}
                pageSize={10}
                total={query.data.total}
                onUpdate={setPage}
                compact
              />
            </div>
          )}
          <ExportExcelButton
            dataset="work_entries"
            params={{
              ...(operation ? { operation_id: operation.id } : {}),
              ...(employee ? { employee_id: employee.id } : {}),
            }}
            label="Работы в Excel"
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

import {FundingSelect, useFundingSources} from '@/entities/Funding';
import {Archive} from '@gravity-ui/icons';
import {
  Alert,
  Button,
  Card,
  Dialog,
  Label,
  Pagination,
  PlaceholderContainer,
  Select,
  Skeleton,
  Table,
  Text,
  TextInput,
  type TableColumnConfig,
} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';

import {
  createFinancialTransaction,
  financeKeys,
  useFinanceEntriesQuery,
  useFinanceSummaryQuery,
  type FinanceEntry,
  type FinanceSource,
  type FinancialDirection,
  type FinancialTransactionCreate,
} from '@/entities/Finance';
import {ExportExcelButton} from '@/features/ExportExcel';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime, formatMoney, normalizeDecimal} from '@/shared/lib';

import styles from './FinancePage.module.scss';

const sourceOptions: Array<{value: FinanceSource; content: string}> = [
  {value: 'all', content: 'Все источники'},
  {value: 'sale', content: 'Продажи'},
  {value: 'material', content: 'Материалы'},
  {value: 'labour', content: 'Оплата труда'},
  {value: 'repair', content: 'Ремонт'},
  {value: 'manual', content: 'Ручные операции'},
];

const directionOptions = [
  {value: 'all', content: 'Доходы и расходы'},
  {value: 'income', content: 'Доходы'},
  {value: 'expense', content: 'Расходы'},
];

const sourceLabels: Record<FinanceSource, string> = {
  all: 'Все',
  sale: 'Продажа',
  material: 'Материал',
  labour: 'Оплата труда',
  manual: 'Вручную',
  repair: 'Ремонт',
};

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function startIso(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function endIso(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

function currentDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function isMoney(value: string): boolean {
  return /^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) && Number(normalizeDecimal(value)) > 0;
}

function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<FinancialDirection>('expense');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(currentDateTime);
  const [category, setCategory] = useState('');
  const [comment, setComment] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: FinancialTransactionCreate) =>
      createFinancialTransaction(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: financeKeys.all});
      setOpen(false);
      setAmount('');
      setCategory('');
      setComment('');
    },
  });
  const openDialog = () => {
    setOccurredAt(currentDateTime());
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
    if (!category.trim()) {
      setValidationError('Укажите категорию операции.');
      return;
    }
    if (!occurredAt) {
      setValidationError('Укажите дату операции.');
      return;
    }
    setValidationError(undefined);
    mutation.mutate({
      transaction_type: direction,
      amount: normalizeDecimal(amount),
      occurred_at: new Date(occurredAt).toISOString(),
      category: category.trim(),
      comment: comment.trim() || null,
      funding_source_id: fundingSource,
    });
  };
  return (
    <>
      <Button view="action" size="l" onClick={openDialog}>
        Добавить операцию
      </Button>
      <Dialog open={open} onClose={close} maxWidth="s" fullWidth>
        <Dialog.Header caption="Ручная финансовая операция" />
        <Dialog.Body>
          <div className={styles.form}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <Select
              label="Тип"
              options={directionOptions.slice(1)}
              value={[direction]}
              onUpdate={(values) =>
                setDirection((values[0] as FinancialDirection) ?? 'expense')
              }
              width="max"
              size="l"
              aria-label="Тип финансовой операции"
            />
            <TextInput
              label="Сумма"
              value={amount}
              onUpdate={setAmount}
              controlProps={{inputMode: 'decimal', 'aria-label': 'Сумма операции'}}
              placeholder="0,00"
              size="l"
              autoFocus
            />
            <TextInput
              label="Категория"
              value={category}
              onUpdate={setCategory}
              controlProps={{'aria-label': 'Категория операции'}}
              size="l"
            />
            <label className={styles.nativeField}>
              <span>Дата операции</span>
              <input
                className={styles.nativeInput}
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
            <FundingSelect value={fundingSource} onChange={setFundingSource} />
            <TextInput label="Комментарий" value={comment} onUpdate={setComment} size="l" />
            <Alert
              theme="warning"
              view="outlined"
              message="После проведения операция станет неизменяемой записью финансовой истории."
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Провести"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

const columns: TableColumnConfig<FinanceEntry>[] = [
  {
    id: 'occurred_at',
    name: 'Дата',
    template: (entry) => formatDateTime(entry.occurred_at),
  },
  {
    id: 'source_type',
    name: 'Источник',
    template: (entry) => <Label>{sourceLabels[entry.source_type]}</Label>,
  },
  {id: 'category', name: 'Категория'},
  {id: 'description', name: 'Описание', primary: true},
  {
    id: 'amount',
    name: 'Сумма',
    align: 'end',
    template: (entry) => (
      <Text color={entry.direction === 'income' ? 'positive' : 'danger'}>
        {entry.direction === 'income' ? '+' : '−'} {formatMoney(entry.amount)}
      </Text>
    ),
  },
  {id: 'comment', name: 'Комментарий', template: (entry) => entry.comment ?? '—'},
];

export function FinancePage() {
  const fundingSources = useFundingSources();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get('page'), 1);
  const pageSize = positiveInteger(searchParams.get('page_size'), 20);
  const source = (searchParams.get('source') ?? 'all') as FinanceSource;
  const rawDirection = searchParams.get('direction') ?? 'all';
  const direction =
    rawDirection === 'income' || rawDirection === 'expense'
      ? rawDirection
      : 'all';
  const dateFrom = searchParams.get('date_from') ?? '';
  const dateTo = searchParams.get('date_to') ?? '';
  const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';
  const dateFilters = {
    ...(searchParams.get("funding_source_id") ? {funding_source_id: searchParams.get("funding_source_id")!} : {}),
    ...(dateFrom ? {date_from: startIso(dateFrom)!} : {}),
    ...(dateTo ? {date_to: endIso(dateTo)!} : {}),
  };
  const query = useFinanceEntriesQuery({
    page,
    page_size: pageSize,
    source,
    ...(direction === 'all' ? {} : {direction}),
    ...dateFilters,
    sort_order: sortOrder,
  });
  const summary = useFinanceSummaryQuery(dateFilters);
  const updateUrl = (updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === 'all') next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, {replace: true});
  };
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Text as="h1" variant="display-1">
          Финансы
        </Text>
        <div className={styles.headerActions}>
          <ExportExcelButton
            dataset="finance_entries"
            params={{
              source,
              ...(direction === 'all' ? {} : {direction}),
              ...dateFilters,
              sort_order: sortOrder,
            }}
          />
          <AddTransactionButton />
        </div>
      </header>
      <div className={styles.summary}>
        <Card view="outlined">
          <Text color="secondary">Доходы</Text>
          <strong className={styles.positive}>
            {summary.data ? formatMoney(summary.data.total_income) : '—'}
          </strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Расходы</Text>
          <strong className={styles.negative}>
            {summary.data ? formatMoney(summary.data.total_expense) : '—'}
          </strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Баланс</Text>
          <strong>{summary.data ? formatMoney(summary.data.balance) : '—'}</strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Продажи</Text>
          <strong>{summary.data ? formatMoney(summary.data.sales_income) : '—'}</strong>
        </Card>
      </div>
      {summary.data ? (
        <div className={styles.breakdown}>
          <Label size="m">Материалы: {formatMoney(summary.data.material_expense)}</Label>
          <Label size="m">Оплата труда: {formatMoney(summary.data.labour_expense)}</Label>
          <Label size="m">Прочие доходы: {formatMoney(summary.data.manual_income)}</Label>
          <Label size="m">Ремонт: {formatMoney(summary.data.repair_expense ?? "0")}</Label>
          <Label size="m">Прочие расходы: {formatMoney(summary.data.manual_expense)}</Label>
        </div>
      ) : null}
      {summary.data?.incomplete_material_movements ? (
        <Alert
          theme="warning"
          title="Расчёт материалов неполный"
          message={`${summary.data.incomplete_material_movements} приходных движений не имеют исторической цены.`}
        />
      ) : null}
      <Card className={styles.tableCard} view="outlined">
        <div className={styles.filters}>
            <Select label="Финансирование" placeholder="Все источники финансирования" hasClear value={searchParams.get("funding_source_id") ? [searchParams.get("funding_source_id")!] : []} options={(fundingSources.data ?? []).map((s) => ({value: s.id, content: s.name}))} onUpdate={(ids) => updateUrl({funding_source_id: ids[0] ?? "", page: 1})} />
          <Select
            label="Источник"
            options={sourceOptions}
            value={[source]}
            onUpdate={(values) => updateUrl({source: values[0] ?? 'all', page: 1})}
            width="max"
            size="l"
          />
          <Select
            label="Направление"
            options={directionOptions}
            value={[direction]}
            onUpdate={(values) =>
              updateUrl({direction: values[0] ?? 'all', page: 1})
            }
            width="max"
            size="l"
          />
          <label className={styles.nativeField}>
            <span>С даты</span>
            <input
              className={styles.nativeInput}
              type="date"
              value={dateFrom}
              onChange={(event) => updateUrl({date_from: event.target.value, page: 1})}
            />
          </label>
          <label className={styles.nativeField}>
            <span>По дату</span>
            <input
              className={styles.nativeInput}
              type="date"
              value={dateTo}
              onChange={(event) => updateUrl({date_to: event.target.value, page: 1})}
            />
          </label>
          <Button
            view="outlined"
            size="l"
            onClick={() =>
              updateUrl({sort_order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1})
            }
          >
            {sortOrder === 'asc' ? 'Сначала старые' : 'Сначала новые'}
          </Button>
        </div>
        {query.isPending ? (
          <Skeleton className={styles.loading} />
        ) : query.isError ? (
          <Alert
            theme="danger"
            title="Не удалось загрузить финансовый журнал"
            message={getErrorMessage(query.error)}
            actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
          />
        ) : query.data.items.length === 0 ? (
          <PlaceholderContainer
            image={<Archive width={100} height={100} />}
            title="Финансовых операций пока нет"
            description="Продажи, выплаты, расходы материалов и ручные операции появятся здесь."
          />
        ) : (
          <div className={styles.content}>
            <div className={styles.tableWrap}>
              <Table
                data={query.data.items}
                columns={[...columns, {id: "funding_source_id", name: "Источник финансирования", template: (entry) => fundingSources.data?.find((s) => s.id === entry.funding_source_id)?.name ?? "Не указан (история)"}]}
                getRowId={(entry) => `${entry.source_type}-${entry.id}`}
                verticalAlign="middle"
              />
            </div>
            <div className={styles.pagination}>
              <Text color="secondary">Всего записей: {query.data.total}</Text>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={query.data.total}
                pageSizeOptions={[10, 20, 50, 100]}
                onUpdate={(nextPage, nextSize) =>
                  updateUrl({page: nextPage, page_size: nextSize})
                }
              />
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}

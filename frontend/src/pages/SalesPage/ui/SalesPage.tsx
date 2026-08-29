import {Archive} from '@gravity-ui/icons';
import {
  Alert,
  Button,
  Card,
  Dialog,
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
import {useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';

import {
  manufacturedItemKeys,
  useManufacturedItemsQuery,
} from '@/entities/ManufacturedItem';
import {
  registerSale,
  saleKeys,
  useSalesQuery,
  useSalesSummaryQuery,
  type Sale,
  type SaleCreate,
  type SaleSortField,
} from '@/entities/Sale';
import {financeKeys} from '@/entities/Finance';
import {ExportExcelButton} from '@/features/ExportExcel';
import {getErrorMessage} from '@/shared/api';
import {
  formatDateTime,
  formatDecimal,
  formatMoney,
  isDecimal,
  normalizeDecimal,
} from '@/shared/lib';

import styles from './SalesPage.module.scss';

const sortOptions: Array<{value: SaleSortField; content: string}> = [
  {value: 'sold_at', content: 'По дате'},
  {value: 'product', content: 'По продукту'},
  {value: 'quantity', content: 'По количеству'},
  {value: 'total_amount', content: 'По сумме'},
];

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
  return /^\d+(?:[.,]\d{1,2})?$/.test(value.trim());
}

function RegisterSaleButton() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [soldAt, setSoldAt] = useState(currentDateTime);
  const [comment, setComment] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const commandKey = useRef(crypto.randomUUID());
  const queryClient = useQueryClient();
  const products = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    kind: 'product',
    include_archived: false,
    sort_by: 'name',
    sort_order: 'asc',
    availability: 'all',
  });
  const selected = products.data?.items.find((item) => item.id === productId);
  const mutation = useMutation({
    mutationFn: (payload: SaleCreate) =>
      registerSale(payload, commandKey.current),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: saleKeys.all}),
        queryClient.invalidateQueries({queryKey: financeKeys.all}),
        queryClient.invalidateQueries({queryKey: manufacturedItemKeys.all}),
      ]);
      setOpen(false);
      setQuantity('');
      setUnitPrice('');
      setComment('');
      commandKey.current = crypto.randomUUID();
    },
  });
  const openDialog = () => {
    commandKey.current = crypto.randomUUID();
    setSoldAt(currentDateTime());
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    const normalizedQuantity = normalizeDecimal(quantity);
    if (!productId) {
      setValidationError('Выберите продукт.');
      return;
    }
    if (!isDecimal(quantity) || Number(normalizedQuantity) <= 0) {
      setValidationError('Укажите положительное количество с точностью до 6 знаков.');
      return;
    }
    if (selected && Number(normalizedQuantity) > Number(selected.free_quantity)) {
      setValidationError('Количество продажи превышает свободный остаток продукта.');
      return;
    }
    if (!isMoney(unitPrice)) {
      setValidationError('Укажите неотрицательную цену с точностью до копеек.');
      return;
    }
    if (!soldAt) {
      setValidationError('Укажите дату продажи.');
      return;
    }
    setValidationError(undefined);
    mutation.mutate({
      product_id: productId,
      quantity: normalizedQuantity,
      unit_price: normalizeDecimal(unitPrice),
      sold_at: new Date(soldAt).toISOString(),
      comment: comment.trim() || null,
    });
  };
  const total =
    isDecimal(quantity) && isMoney(unitPrice)
      ? Number(normalizeDecimal(quantity)) * Number(normalizeDecimal(unitPrice))
      : null;
  return (
    <>
      <Button view="action" size="l" onClick={openDialog}>
        Зарегистрировать продажу
      </Button>
      <Dialog open={open} onClose={close} maxWidth="m" fullWidth>
        <Dialog.Header caption="Регистрация продажи" />
        <Dialog.Body>
          <div className={styles.form}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <Select
              label="Продукт"
              options={(products.data?.items ?? []).map((item) => ({
                value: item.id,
                content: `${item.name} · доступно ${formatDecimal(item.free_quantity)} ${item.unit}`,
              }))}
              value={productId ? [productId] : []}
              onUpdate={(values) => setProductId(values[0] ?? '')}
              loading={products.isPending}
              width="max"
              size="l"
              filterable
              aria-label="Продаваемый продукт"
            />
            <TextInput
              label={`Количество${selected ? `, ${selected.unit}` : ''}`}
              value={quantity}
              onUpdate={setQuantity}
              controlProps={{inputMode: 'decimal', 'aria-label': 'Количество продажи'}}
              placeholder="0"
              size="l"
            />
            <TextInput
              label="Цена за единицу"
              value={unitPrice}
              onUpdate={setUnitPrice}
              controlProps={{inputMode: 'decimal', 'aria-label': 'Цена продажи'}}
              placeholder="0,00"
              size="l"
            />
            <label className={styles.nativeField}>
              <span>Дата продажи</span>
              <input
                className={styles.nativeInput}
                type="datetime-local"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
              />
            </label>
            <TextInput label="Комментарий" value={comment} onUpdate={setComment} size="l" />
            <Alert
              theme="info"
              view="outlined"
              message={
                total === null
                  ? 'После подтверждения продукт будет списан со склада.'
                  : `Итого: ${total.toFixed(2)} ₽. Продукт будет списан со склада.`
              }
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Провести продажу"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

function SaleDetailsButton({sale}: {sale: Sale}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button view="flat-secondary" size="s" onClick={() => setOpen(true)}>
        Детали
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="s" fullWidth>
        <Dialog.Header caption={`Продажа: ${sale.product_name}`} />
        <Dialog.Body>
          <div className={styles.form}>
            <Text>Дата: {formatDateTime(sale.sold_at)}</Text>
            <Text>
              Количество: {formatDecimal(sale.quantity)} {sale.product_unit}
            </Text>
            <Text>Цена: {formatMoney(sale.unit_price)}</Text>
            <Text variant="subheader-2">Итого: {formatMoney(sale.total_amount)}</Text>
            <Text color="secondary">
              Остаток после продажи: {formatDecimal(sale.balance_after)} {sale.product_unit}
            </Text>
            <Text color="secondary">Провёл: {sale.created_by}</Text>
            <Text color="secondary">Складское движение: {sale.inventory_movement_id}</Text>
            {sale.comment ? <Text>Комментарий: {sale.comment}</Text> : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonCancel="Закрыть"
          onClickButtonCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

const columns: TableColumnConfig<Sale>[] = [
  {id: 'sold_at', name: 'Дата', template: (sale) => formatDateTime(sale.sold_at)},
  {id: 'product_name', name: 'Продукт', primary: true},
  {
    id: 'quantity',
    name: 'Количество',
    align: 'end',
    template: (sale) => `${formatDecimal(sale.quantity)} ${sale.product_unit}`,
  },
  {
    id: 'unit_price',
    name: 'Цена',
    align: 'end',
    template: (sale) => formatMoney(sale.unit_price),
  },
  {
    id: 'total_amount',
    name: 'Сумма',
    align: 'end',
    template: (sale) => formatMoney(sale.total_amount),
  },
  {
    id: 'balance_after',
    name: 'Остаток после',
    align: 'end',
    template: (sale) => formatDecimal(sale.balance_after),
  },
  {id: 'comment', name: 'Комментарий', template: (sale) => sale.comment ?? '—'},
  {
    id: 'actions',
    name: 'Действия',
    sticky: 'end',
    template: (sale) => <SaleDetailsButton sale={sale} />,
  },
];

export function SalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get('page'), 1);
  const pageSize = positiveInteger(searchParams.get('page_size'), 20);
  const productId = searchParams.get('product_id') ?? '';
  const dateFrom = searchParams.get('date_from') ?? '';
  const dateTo = searchParams.get('date_to') ?? '';
  const sortBy = (searchParams.get('sort_by') ?? 'sold_at') as SaleSortField;
  const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';
  const apiFilters = {
    ...(productId ? {product_id: productId} : {}),
    ...(dateFrom ? {date_from: startIso(dateFrom)!} : {}),
    ...(dateTo ? {date_to: endIso(dateTo)!} : {}),
  };
  const query = useSalesQuery({
    page,
    page_size: pageSize,
    ...apiFilters,
    sort_by: sortBy,
    sort_order: sortOrder,
  });
  const summary = useSalesSummaryQuery(apiFilters);
  const products = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    kind: 'product',
    include_archived: true,
    sort_by: 'name',
    sort_order: 'asc',
    availability: 'all',
  });
  const updateUrl = (updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, {replace: true});
  };
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Text as="h1" variant="display-1">
          Продажи
        </Text>
        <div className={styles.headerActions}>
          <ExportExcelButton
            dataset="sales"
            params={{
              ...apiFilters,
              sort_by: sortBy,
              sort_order: sortOrder,
            }}
          />
          <RegisterSaleButton />
        </div>
      </header>
      <div className={styles.summary}>
        <Card view="outlined">
          <Text color="secondary">Выручка</Text>
          <strong>{summary.data ? formatMoney(summary.data.total_amount) : '—'}</strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Продано единиц</Text>
          <strong>
            {summary.data ? formatDecimal(summary.data.total_quantity) : '—'}
          </strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Средняя цена</Text>
          <strong>
            {summary.data ? formatMoney(summary.data.average_unit_price) : '—'}
          </strong>
        </Card>
      </div>
      <Card className={styles.tableCard} view="outlined">
        <div className={styles.filters}>
          <Select
            label="Продукт"
            options={[
              {value: '', content: 'Все продукты'},
              ...(products.data?.items ?? []).map((item) => ({
                value: item.id,
                content: item.name,
              })),
            ]}
            value={[productId]}
            onUpdate={(values) => updateUrl({product_id: values[0] ?? '', page: 1})}
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
          <Select
            label="Сортировка"
            options={sortOptions}
            value={[sortBy]}
            onUpdate={(values) =>
              updateUrl({sort_by: values[0] ?? 'sold_at', page: 1})
            }
            width="max"
            size="l"
          />
          <Button
            view="outlined"
            size="l"
            onClick={() =>
              updateUrl({sort_order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1})
            }
          >
            {sortOrder === 'asc' ? 'По возрастанию' : 'По убыванию'}
          </Button>
        </div>
        {query.isPending ? (
          <Skeleton className={styles.loading} />
        ) : query.isError ? (
          <Alert
            theme="danger"
            title="Не удалось загрузить продажи"
            message={getErrorMessage(query.error)}
            actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
          />
        ) : query.data.items.length === 0 ? (
          <PlaceholderContainer
            image={<Archive width={100} height={100} />}
            title="Продаж пока нет"
            description="Зарегистрируйте первую продажу готового продукта."
          />
        ) : (
          <div className={styles.content}>
            <div className={styles.tableWrap}>
              <Table
                data={query.data.items}
                columns={columns}
                getRowId={(sale) => sale.id}
                verticalAlign="middle"
              />
            </div>
            <div className={styles.pagination}>
              <Text color="secondary">
                Всего: {query.data.total} · сумма: {formatMoney(query.data.filtered_amount)}
              </Text>
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

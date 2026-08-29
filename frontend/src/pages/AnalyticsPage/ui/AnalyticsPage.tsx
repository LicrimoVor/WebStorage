import {ChartColumn} from '@gravity-ui/icons';
import {
  Alert,
  Button,
  Card,
  PlaceholderContainer,
  Select,
  Skeleton,
  Table,
  Text,
  type TableColumnConfig,
  type TableDataItem,
} from '@gravity-ui/uikit';
import {useMemo} from 'react';
import {useSearchParams} from 'react-router-dom';

import {
  useAnalyticsDashboardQuery,
  type DemandedMaterialRow,
  type EmployeeAnalyticsRow,
  type OperationAnalyticsRow,
  type ProductSalesRow,
  type StockPoint,
} from '@/entities/Analytics';
import {ExportExcelButton} from '@/features/ExportExcel';
import {getErrorMessage} from '@/shared/api';
import {formatDecimal, formatMoney} from '@/shared/lib';

import styles from './AnalyticsPage.module.scss';

type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const periodOptions: Array<{value: PeriodPreset; content: string}> = [
  {value: 'today', content: 'Сегодня'},
  {value: 'week', content: 'Неделя'},
  {value: 'month', content: 'Месяц'},
  {value: 'quarter', content: 'Квартал'},
  {value: 'year', content: 'Год'},
  {value: 'custom', content: 'Свой период'},
];

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function presetRange(preset: PeriodPreset): {dateFrom: string; dateTo: string} {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'week') start.setDate(start.getDate() - 6);
  if (preset === 'month') start.setDate(1);
  if (preset === 'quarter') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  if (preset === 'year') start.setMonth(0, 1);
  return {dateFrom: dateValue(start), dateTo: dateValue(now)};
}

function startIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

function endIso(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function bucketFor(dateFrom: string, dateTo: string): 'day' | 'week' | 'month' {
  const days =
    (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86_400_000;
  if (days <= 92) return 'day';
  if (days <= 730) return 'week';
  return 'month';
}

function formatPeriod(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(new Date(value));
}

function KpiCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <Card view="outlined" className={styles.kpiCard}>
      <Text color="secondary">{label}</Text>
      <strong>{value}</strong>
      {note ? <Text color="secondary">{note}</Text> : null}
    </Card>
  );
}

interface ChartDatum {
  label: string;
  values: Array<{name: string; value: number}>;
}

function BarChart({data}: {data: ChartDatum[]}) {
  const max = Math.max(
    1,
    ...data.flatMap((item) => item.values.map((itemValue) => itemValue.value)),
  );
  if (data.length === 0) {
    return <Text color="secondary">За выбранный период данных нет.</Text>;
  }
  return (
    <div className={styles.chart} role="img" aria-label="Динамика по периодам">
      {data.map((item) => (
        <div className={styles.chartGroup} key={item.label}>
          <div className={styles.bars}>
            {item.values.map((itemValue, index) => (
              <div
                className={index === 0 ? styles.barPrimary : styles.barSecondary}
                key={itemValue.name}
                style={{height: `${Math.max((itemValue.value / max) * 100, 2)}%`}}
                title={`${itemValue.name}: ${itemValue.value}`}
              />
            ))}
          </div>
          <Text className={styles.chartLabel} color="secondary">
            {item.label}
          </Text>
        </div>
      ))}
    </div>
  );
}

const productColumns: TableColumnConfig<ProductSalesRow>[] = [
  {id: 'name', name: 'Продукт', primary: true},
  {
    id: 'quantity',
    name: 'Продано',
    align: 'end',
    template: (row) => `${formatDecimal(row.quantity)} ${row.unit}`,
  },
  {
    id: 'revenue',
    name: 'Выручка',
    align: 'end',
    template: (row) => formatMoney(row.revenue),
  },
  {
    id: 'current_stock',
    name: 'Остаток',
    align: 'end',
    template: (row) => `${formatDecimal(row.current_stock)} ${row.unit}`,
  },
];

const materialColumns: TableColumnConfig<DemandedMaterialRow>[] = [
  {id: 'name', name: 'Материал', primary: true},
  {
    id: 'consumed_quantity',
    name: 'Израсходовано',
    align: 'end',
    template: (row) => `${formatDecimal(row.consumed_quantity)} ${row.unit}`,
  },
];

const employeeColumns: TableColumnConfig<EmployeeAnalyticsRow>[] = [
  {id: 'full_name', name: 'Сотрудник', primary: true},
  {
    id: 'completed_operations',
    name: 'Операции',
    align: 'end',
    template: (row) => formatDecimal(row.completed_operations),
  },
  {
    id: 'person_hours',
    name: 'Человеко-часы',
    align: 'end',
    template: (row) => formatDecimal(row.person_hours),
  },
  {id: 'accrued', name: 'Начислено', align: 'end', template: (row) => formatMoney(row.accrued)},
  {id: 'paid', name: 'Выплачено', align: 'end', template: (row) => formatMoney(row.paid)},
  {
    id: 'payable_current',
    name: 'К выплате',
    align: 'end',
    template: (row) => formatMoney(row.payable_current),
  },
];

const operationColumns: TableColumnConfig<OperationAnalyticsRow>[] = [
  {id: 'name', name: 'Операция', primary: true},
  {
    id: 'completed_operations',
    name: 'Выполнено',
    align: 'end',
    template: (row) => formatDecimal(row.completed_operations),
  },
  {
    id: 'person_hours',
    name: 'Человеко-часы',
    align: 'end',
    template: (row) => formatDecimal(row.person_hours),
  },
  {id: 'accrued', name: 'Начислено', align: 'end', template: (row) => formatMoney(row.accrued)},
];

const stockColumns: TableColumnConfig<StockPoint>[] = [
  {
    id: 'period_start',
    name: 'Период',
    primary: true,
    template: (row) => formatPeriod(row.period_start),
  },
  {
    id: 'materials_delta',
    name: 'Материалы Δ',
    align: 'end',
    template: (row) => formatDecimal(row.materials_delta),
  },
  {
    id: 'semi_finished_delta',
    name: 'Полуфабрикаты Δ',
    align: 'end',
    template: (row) => formatDecimal(row.semi_finished_delta),
  },
  {
    id: 'products_delta',
    name: 'Продукты Δ',
    align: 'end',
    template: (row) => formatDecimal(row.products_delta),
  },
];

function DataTable<T extends TableDataItem>({
  rows,
  columns,
  rowId,
}: {
  rows: T[];
  columns: TableColumnConfig<T>[];
  rowId: (row: T) => string;
}) {
  if (rows.length === 0) {
    return <Text color="secondary">За выбранный период данных нет.</Text>;
  }
  return (
    <div className={styles.tableWrap}>
      <Table data={rows} columns={columns} getRowId={rowId} verticalAlign="middle" />
    </div>
  );
}

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPreset = searchParams.get('period') as PeriodPreset | null;
  const preset = periodOptions.some((option) => option.value === rawPreset)
    ? (rawPreset as PeriodPreset)
    : 'month';
  const fallbackRange = useMemo(() => presetRange(preset), [preset]);
  const dateFrom = searchParams.get('date_from') ?? fallbackRange.dateFrom;
  const dateTo = searchParams.get('date_to') ?? fallbackRange.dateTo;
  const query = useAnalyticsDashboardQuery({
    date_from: startIso(dateFrom),
    date_to: endIso(dateTo),
    bucket: bucketFor(dateFrom, dateTo),
  });
  const updatePeriod = (nextPreset: PeriodPreset) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', nextPreset);
    if (nextPreset === 'custom') {
      next.set('date_from', dateFrom);
      next.set('date_to', dateTo);
    } else {
      next.delete('date_from');
      next.delete('date_to');
    }
    setSearchParams(next, {replace: true});
  };
  const updateDate = (key: 'date_from' | 'date_to', value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', 'custom');
    next.set('date_from', key === 'date_from' ? value : dateFrom);
    next.set('date_to', key === 'date_to' ? value : dateTo);
    setSearchParams(next, {replace: true});
  };

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">Аналитика</Text>
          <Text color="secondary">
            Производство, продажи, склад и персонал в одном отчёте
          </Text>
        </div>
        <div className={styles.periodControls}>
          <Select
            label="Период"
            options={periodOptions}
            value={[preset]}
            onUpdate={(values) =>
              updatePeriod((values[0] as PeriodPreset) ?? 'month')
            }
            width="max"
            size="l"
          />
          {preset === 'custom' ? (
            <>
              <label className={styles.nativeField}>
                <span>С даты</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => updateDate('date_from', event.target.value)}
                />
              </label>
              <label className={styles.nativeField}>
                <span>По дату</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => updateDate('date_to', event.target.value)}
                />
              </label>
            </>
          ) : null}
          <ExportExcelButton
            dataset="analytics"
            params={{
              date_from: startIso(dateFrom),
              date_to: endIso(dateTo),
            }}
          />
        </div>
      </header>

      {query.isPending ? (
        <Skeleton className={styles.loading} />
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить аналитику"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : !query.data ? (
        <PlaceholderContainer
          image={<ChartColumn width={100} height={100} />}
          title="Данных пока нет"
        />
      ) : (
        <Dashboard dashboard={query.data} />
      )}
    </main>
  );
}

function Dashboard({
  dashboard,
}: {
  dashboard: NonNullable<ReturnType<typeof useAnalyticsDashboardQuery>['data']>;
}) {
  return (
    <div className={styles.dashboard}>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <Text as="h2" variant="header-1">Производство</Text>
          <Text color="secondary">Выпуск, планы и фактическая выработка</Text>
        </div>
        <div className={styles.kpis}>
          <KpiCard label="Произведено продуктов" value={formatDecimal(dashboard.production.produced_products)} />
          <KpiCard label="Произведено полуфабрикатов" value={formatDecimal(dashboard.production.produced_semi_finished)} />
          <KpiCard label="Выполнение планов" value={`${formatDecimal(dashboard.production.plan_completion_percent)}%`} note={`${dashboard.production.completed_plans} из ${dashboard.production.plans} завершено`} />
          <KpiCard label="Выполнено операций" value={formatDecimal(dashboard.production.completed_operations)} note={`${formatDecimal(dashboard.production.person_hours)} чел.-ч`} />
        </div>
        <Card view="outlined" className={styles.panel}>
          <Text as="h3" variant="subheader-3">Динамика выпуска</Text>
          <div className={styles.legend}>
            <span className={styles.primaryDot} />Продукты
            <span className={styles.secondaryDot} />Полуфабрикаты
          </div>
          <BarChart
            data={dashboard.production.dynamics.map((point) => ({
              label: formatPeriod(point.period_start),
              values: [
                {name: 'Продукты', value: Number(point.products_quantity)},
                {name: 'Полуфабрикаты', value: Number(point.semi_finished_quantity)},
              ],
            }))}
          />
        </Card>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <Text as="h2" variant="header-1">Продажи</Text>
          <Text color="secondary">Выручка и структура реализации</Text>
        </div>
        <div className={styles.kpis}>
          <KpiCard label="Выручка" value={formatMoney(dashboard.sales.revenue)} />
          <KpiCard label="Продано" value={formatDecimal(dashboard.sales.sold_quantity)} />
          <KpiCard label="Средняя цена" value={formatMoney(dashboard.sales.average_unit_price)} />
          <KpiCard label="Текущий остаток продуктов" value={formatDecimal(dashboard.sales.current_product_stock)} />
        </div>
        <div className={styles.twoColumns}>
          <Card view="outlined" className={styles.panel}>
            <Text as="h3" variant="subheader-3">Динамика выручки</Text>
            <BarChart
              data={dashboard.sales.dynamics.map((point) => ({
                label: formatPeriod(point.period_start),
                values: [{name: 'Выручка', value: Number(point.revenue)}],
              }))}
            />
          </Card>
          <Card view="outlined" className={styles.panel}>
            <Text as="h3" variant="subheader-3">Продажи по продуктам</Text>
            <DataTable rows={dashboard.sales.by_product} columns={productColumns} rowId={(row) => row.product_id} />
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <Text as="h2" variant="header-1">Склад</Text>
          <Text color="secondary">Стоимость, дефицит и движения запасов</Text>
        </div>
        <div className={styles.kpis}>
          <KpiCard label="Стоимость материалов" value={formatMoney(dashboard.warehouse.current_material_stock_value)} note={dashboard.warehouse.unpriced_material_positions ? `Без цены: ${dashboard.warehouse.unpriced_material_positions}` : undefined} />
          <KpiCard label="Дефицит материалов" value={formatDecimal(dashboard.warehouse.material_deficit_quantity)} note={`${dashboard.warehouse.material_deficit_positions} позиций`} />
          <KpiCard label="Движения материалов" value={String(dashboard.warehouse.material_movements)} note={`Приход ${formatDecimal(dashboard.warehouse.material_inflow)} · расход ${formatDecimal(dashboard.warehouse.material_outflow)}`} />
          <KpiCard label="Движения полуфабрикатов" value={String(dashboard.warehouse.semi_finished_movements)} note={`Приход ${formatDecimal(dashboard.warehouse.semi_finished_inflow)} · расход ${formatDecimal(dashboard.warehouse.semi_finished_outflow)}`} />
        </div>
        <div className={styles.twoColumns}>
          <Card view="outlined" className={styles.panel}>
            <Text as="h3" variant="subheader-3">Самые востребованные материалы</Text>
            <DataTable rows={dashboard.warehouse.demanded_materials} columns={materialColumns} rowId={(row) => row.material_id} />
          </Card>
          <Card view="outlined" className={styles.panel}>
            <Text as="h3" variant="subheader-3">Изменение запасов</Text>
            <DataTable rows={dashboard.warehouse.dynamics} columns={stockColumns} rowId={(row) => row.period_start} />
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <Text as="h2" variant="header-1">Персонал</Text>
          <Text color="secondary">Выработка и расчёты с сотрудниками</Text>
        </div>
        <div className={styles.kpis}>
          <KpiCard label="Начислено" value={formatMoney(dashboard.personnel.accrued)} />
          <KpiCard label="Выплачено" value={formatMoney(dashboard.personnel.paid)} />
          <KpiCard label="К выплате сейчас" value={formatMoney(dashboard.personnel.payable_current)} />
          <KpiCard label="Выполнено операций" value={formatDecimal(dashboard.personnel.completed_operations)} note={`${formatDecimal(dashboard.personnel.person_hours)} чел.-ч`} />
        </div>
        <Card view="outlined" className={styles.panel}>
          <Text as="h3" variant="subheader-3">По сотрудникам</Text>
          <DataTable rows={dashboard.personnel.by_employee} columns={employeeColumns} rowId={(row) => row.employee_id} />
        </Card>
        <Card view="outlined" className={styles.panel}>
          <Text as="h3" variant="subheader-3">По операциям</Text>
          <DataTable rows={dashboard.personnel.by_operation} columns={operationColumns} rowId={(row) => row.operation_id} />
        </Card>
      </section>
    </div>
  );
}

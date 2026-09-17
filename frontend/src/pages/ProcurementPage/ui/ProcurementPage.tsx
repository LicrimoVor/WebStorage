import {Alert, Button, Card, Label, Pagination, Table, Text, TextInput, type TableColumnConfig} from '@gravity-ui/uikit';
import {useSearchParams} from 'react-router-dom';

import {useProcurementQuery, type ProcurementItem} from '@/entities/Procurement';
import {ExportExcelButton} from '@/features/ExportExcel';
import {getErrorMessage} from '@/shared/api';
import {formatMoney, formatDecimal} from '@/shared/lib';

import styles from './ProcurementPage.module.scss';

const columns: TableColumnConfig<ProcurementItem>[] = [
  {id: 'name', name: 'Материал', template: (item) => <>
    {item.name} {item.archived && <Label theme="warning">В архиве</Label>}
  </>},
  {id: 'required_quantity', name: 'Потребность', template: (item) => formatDecimal(item.required_quantity)},
  {id: 'stock_quantity', name: 'Остаток', template: (item) => formatDecimal(item.stock_quantity)},
  {id: 'purchase_quantity', name: 'К закупке', template: (item) => <strong>{formatDecimal(item.purchase_quantity)}</strong>},
  {id: 'unit', name: 'Ед.'},
  {id: 'unit_price', name: 'Цена', template: (item) => formatMoney(item.unit_price)},
  {id: 'estimated_cost', name: 'Сумма', template: (item) => formatMoney(item.estimated_cost)},
  {id: 'target_date', name: 'Срок плана', template: (item) => item.target_date?.split('-').reverse().join('.') ?? '—'},
  {id: 'active_plans', name: 'Планов'},
  {id: 'url', name: 'Закупка', template: (item) => item.url && /^https?:\/\//i.test(item.url)
    ? <a href={item.url} target="_blank" rel="noopener noreferrer">Открыть ссылку</a> : '—'},
];

export function ProcurementPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = (params.get('search') ?? '').slice(0, 200);
  const query = useProcurementQuery(page, search);
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    return next;
  }, {replace: true});

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">Закупки по дефициту</Text>
          <Text as="p" color="secondary">Материалы для активных производственных планов с учётом текущих остатков.</Text>
        </div>
        <ExportExcelButton dataset="procurement" params={{search}} label="Скачать закупки Excel" />
      </header>
      <div className={styles.filters}>
        <TextInput aria-label="Поиск материала" placeholder="Поиск материала" value={search}
          onUpdate={(value) => update('search', value)} controlProps={{maxLength: 200}} hasClear />
        <Button loading={query.isFetching} onClick={() => void query.refetch()}>Обновить</Button>
      </div>
      <Text as="p" color="secondary">Количество к закупке = потребность − остаток. Заказы поставщикам не создаются; поступление учитывается после проведения прихода на склад.</Text>
      {query.isError ? <Alert theme="danger" title="Не удалось загрузить закупки" message={getErrorMessage(query.error)} /> : null}
      {query.isPending ? <Text role="status">Загрузка закупок…</Text> : null}
      {query.data && !query.isError && <>
        <div className={styles.summary}>
          <Card className={styles.card}><Text color="secondary">Позиций к закупке</Text><Text variant="header-2">{query.data.total}</Text></Card>
          <Card className={styles.card}><Text color="secondary">Сумма по известным ценам</Text><Text variant="header-2">{formatMoney(query.data.known_cost)}</Text></Card>
          <Card className={styles.card}><Text color="secondary">Позиций без цены</Text><Text variant="header-2">{query.data.unpriced_positions}</Text></Card>
        </div>
        {query.data.unpriced_positions > 0 && <Alert theme="warning" message="Сумма неполная: у части материалов не указана цена." />}
        {query.data.items.some((item) => item.archived) && <Alert theme="warning" message="В потребностях есть архивные материалы. Проверьте их перед закупкой." />}
        <div className={styles.table}><Table columns={columns} data={query.data.items}
          getRowDescriptor={(item) => ({id: item.material_id})} emptyMessage={search ? 'По вашему поиску дефицит не найден.' : 'Дефицита материалов нет.'} /></div>
        <Pagination page={page} pageSize={20} total={query.data.total} onUpdate={(value) => update('page', String(value))} />
      </>}
    </main>
  );
}

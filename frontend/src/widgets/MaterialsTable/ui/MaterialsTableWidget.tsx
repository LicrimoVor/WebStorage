import {
  Alert,
  Button,
  Card,
  Pagination,
  PlaceholderContainer,
  Select,
  Skeleton,
  Switch,
  Text,
  TextInput,
} from '@gravity-ui/uikit';
import {Boxes3} from '@gravity-ui/icons';
import {useSearchParams} from 'react-router-dom';

import {
  MaterialsTable,
  useMaterialsQuery,
  type AvailabilityFilter,
  type Material,
  type MaterialListParams,
  type MaterialSortField,
  type SortOrder,
} from '@/entities/Material';
import {AdjustStockButton} from '@/features/AdjustStock';
import {ArchiveMaterialButton} from '@/features/ArchiveMaterial';
import {CreateMaterialButton} from '@/features/CreateMaterial';
import {EditMaterialButton} from '@/features/EditMaterial';
import {InventoryHistoryButton} from '@/features/ViewInventoryHistory';
import {getErrorMessage} from '@/shared/api';

import styles from './MaterialsTableWidget.module.scss';

const sortOptions: Array<{value: MaterialSortField; content: string}> = [
  {value: 'name', content: 'По названию'},
  {value: 'free_quantity', content: 'По остатку'},
  {value: 'price', content: 'По цене'},
  {value: 'created_at', content: 'По дате создания'},
];

const availabilityOptions: Array<{value: AvailabilityFilter; content: string}> = [
  {value: 'all', content: 'Любое наличие'},
  {value: 'in_stock', content: 'Есть в наличии'},
  {value: 'out_of_stock', content: 'Нет в наличии'},
];

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function MaterialsTableWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get('page'), 1);
  const pageSize = positiveInteger(searchParams.get('page_size'), 20);
  const search = searchParams.get('search') ?? '';
  const sortBy = (searchParams.get('sort_by') ?? 'name') as MaterialSortField;
  const sortOrder = (searchParams.get('sort_order') ?? 'asc') as SortOrder;
  const availability = (searchParams.get('availability') ?? 'all') as AvailabilityFilter;
  const deficitOnly = searchParams.get('deficit_only') === 'true';

  const params: MaterialListParams = {
    page,
    page_size: pageSize,
    search: search || null,
    sort_by: sortBy,
    sort_order: sortOrder,
    availability,
    deficit_only: deficitOnly,
  };
  const query = useMaterialsQuery(params);

  const updateUrl = (updates: Record<string, string | number | boolean | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === false) next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, {replace: true});
  };

  const renderActions = (material: Material) => (
    <div className={styles.actions}>
      <AdjustStockButton material={material} />
      <InventoryHistoryButton material={material} />
      <EditMaterialButton material={material} />
      <ArchiveMaterialButton material={material} />
    </div>
  );

  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            Материалы
          </Text>
          <Text as="p" color="secondary" className={styles.subtitle}>
            Фактический остаток формируется только складскими движениями
          </Text>
        </div>
        <CreateMaterialButton />
      </div>

      <div className={styles.filters}>
        <TextInput
          type="search"
          value={search}
          onUpdate={(value) => updateUrl({search: value, page: 1})}
          placeholder="Поиск по названию"
          hasClear
          size="l"
          controlProps={{'aria-label': 'Поиск материалов'}}
        />
        <Select
          options={availabilityOptions}
          value={[availability]}
          onUpdate={(values) =>
            updateUrl({availability: values[0] ?? 'all', page: 1})
          }
          width="max"
          size="l"
          aria-label="Фильтр по наличию"
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) => updateUrl({sort_by: values[0] ?? 'name', page: 1})}
          width="max"
          size="l"
          aria-label="Сортировка материалов"
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
        <Switch
          size="l"
          checked={deficitOnly}
          onUpdate={(checked) => updateUrl({deficit_only: checked, page: 1})}
        >
          Только дефицит
        </Switch>
      </div>

      {query.isPending ? (
        <div className={styles.loading} aria-label="Загрузка материалов">
          {Array.from({length: 6}, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить материалы"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Boxes3 />}
          title={search || deficitOnly ? 'Ничего не найдено' : 'Материалов пока нет'}
          description={
            search || deficitOnly
              ? 'Измените поисковый запрос или фильтры.'
              : 'Создайте первый материал и укажите его начальный остаток.'
          }
          actions={!search && !deficitOnly ? <CreateMaterialButton /> : null}
        />
      ) : (
        <div className={styles.content}>
          <MaterialsTable items={query.data.items} renderActions={renderActions} />
          <div className={styles.pagination}>
            <Text color="secondary">Всего: {query.data.total}</Text>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={query.data.total}
              pageSizeOptions={[10, 20, 50, 100]}
              onUpdate={(nextPage, nextPageSize) =>
                updateUrl({page: nextPage, page_size: nextPageSize})
              }
              showInput
            />
          </div>
        </div>
      )}
    </Card>
  );
}

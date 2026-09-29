import {ArrowUpRightFromSquare} from '@gravity-ui/icons';
import {Alert, Button, Dialog, Icon} from '@gravity-ui/uikit';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {useAuthSessionQuery} from '@/entities/Auth';
import {useStockRevisionRowsQuery} from '@/entities/StockRevision';
import {useProductOptionsQuery, type ManufacturedItem} from '@/entities/ManufacturedItem';
import {CreateManufacturedItemButton} from '@/features/CreateManufacturedItem';
import {EditManufacturedItemButton} from '@/features/EditManufacturedItem';
import {ProduceManufacturedItemButton} from '@/features/ProduceManufacturedItem';
import {ManufacturedInventoryHistoryButton} from '@/features/ViewManufacturedInventoryHistory';
import {DetailCardFooter, DetailCardMetrics} from '@/shared/ui/DetailCard';
import card from '@/shared/ui/DetailCard.module.scss';
import {apiRequest, getErrorMessage} from '@/shared/api';
import type {components} from '@/shared/api/generated/schema';
import {formatDecimal, formatDateTime} from '@/shared/lib';
import {canAccess} from '@/shared/lib/access';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';
import local from './ManufacturedItemsTable.module.scss';

type StockRow = components['schemas']['StockRevisionRow'];
type Composition = components['schemas']['ItemComposition'];
const kindLabels = {material: 'Материал', semi_finished: 'Полуфабрикат', operation: 'Операция'};

function useComposition(id: string) {
  return useQuery({queryKey: ['manufactured-items', 'composition', id],
    queryFn: () => apiRequest<Composition>(`/manufactured-items/${id}/composition`)});
}

function ProcessLink({processId}: {processId: string | null | undefined}) {
  const session = useAuthSessionQuery();
  if (!session.data || !canAccess(session.data, 'processes')) return null;
  return processId ? <Button component={Link} to={`/processes/${processId}`}>
    <Icon data={ArrowUpRightFromSquare} />Перейти в техпроцесс
  </Button> : <span className={local.hint}>Техпроцесс ещё не создан</span>;
}

function CompositionDialog({row, onClose}: {row: StockRow; onClose: () => void}) {
  const query = useComposition(row.id);
  const detail = useQuery({queryKey: ['manufactured-items', 'detail', row.id], queryFn: () => apiRequest<ManufacturedItem>(`/manufactured-items/${row.id}`)});
  const products = useProductOptionsQuery();
  const item = detail.data;
  return <Dialog open onClose={onClose} size="l">
    <Dialog.Header caption={item?.name ?? row.name} />
    <Dialog.Body><div className={card.body}>
      {detail.isPending && <p role="status">Загрузка карточки…</p>}
      {detail.isError && <Alert theme="danger" message={getErrorMessage(detail.error)} actions={<Button onClick={() => detail.refetch()}>Повторить</Button>} />}
      {item && <>
        {item.image && <img src={item.image} alt={item.name} className={card.image} />}
        <DetailCardMetrics items={[
          {label: 'Свободно', value: formatDecimal(item.free_quantity), unit: item.unit},
          {label: 'Требуется', value: formatDecimal(item.required_quantity), unit: item.unit},
          {label: 'Изготовить', value: formatDecimal(item.to_produce_quantity), unit: item.unit, warning: Number(item.to_produce_quantity) > 0},
        ]} />
        <dl className={card.metadata}>
          <div><dt>Тип</dt><dd>{item.is_product ? 'Продукт' : 'Полуфабрикат'}</dd></div>
          {!item.is_product && <div><dt>Продукт</dt><dd>{products.data?.find((p) => p.id === item.product_id)?.name ?? 'Не указан'}</dd></div>}
          <div><dt>Группы</dt><dd>{item.groups?.map((g) => g.name).join(', ') || 'Без группы'}</dd></div>
          <div><dt>Единица измерения</dt><dd>{item.unit}</dd></div>
          <div><dt>Статус</dt><dd>{item.archived ? 'В архиве' : 'Активный'}</dd></div>
          <div><dt>Создан</dt><dd>{formatDateTime(item.created_at)}</dd></div>
          <div><dt>Изменён</dt><dd>{formatDateTime(item.updated_at)}</dd></div>
        </dl>
      </>}
      <h3>Состав на 1 {item?.unit ?? row.unit}</h3>
      {query.isPending && <p role="status">Загрузка состава…</p>}
      {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} actions={<Button onClick={() => query.refetch()}>Повторить</Button>} />}
      {query.data && <>
        {!query.data.has_recipe ? <Alert theme="info" message="Опубликованный рецепт отсутствует. Состав появится после публикации техпроцесса." /> : <>
          <p>Действующий рецепт, версия {query.data.version_number}. Вложенные полуфабрикаты указаны отдельными позициями.</p>
          <div className={styles.scroll}><table className={styles.table}>
            <thead><tr><th>Тип</th><th>Название</th><th data-numeric>Количество</th><th data-numeric>Единица</th></tr></thead>
            <tbody>{query.data.entries?.map((entry) => <tr key={`${entry.kind}-${entry.id}`}>
              <td>{kindLabels[entry.kind]}</td><td>{entry.name}</td>
              <td data-numeric>{formatDecimal(entry.quantity)}</td><td data-numeric>{entry.unit}</td>
            </tr>)}</tbody>
          </table></div>
          {!query.data.entries?.length && <p>В рецепте нет компонентов.</p>}
        </>}
      </>}
    </div></Dialog.Body>
    <DetailCardFooter onClose={onClose}>{item && <>
      {query.data && <ProcessLink processId={query.data.process_id} />}
      {!item.archived && !item.is_product && <ProduceManufacturedItemButton itemId={item.id} itemName={item.name} />}
      {!item.archived && <EditManufacturedItemButton item={item} />}
      <ManufacturedInventoryHistoryButton item={item} />
    </>}</DetailCardFooter>
  </Dialog>;
}

function ItemsTable({rows, onSelect}: {rows: StockRow[]; onSelect: (row: StockRow) => void}) {
  return <div className={styles.scroll}><table className={styles.table}>
    <thead><tr><th>Название</th><th>Тип</th><th data-numeric>Остаток</th><th data-numeric>Единица</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} className={local.itemRow} onClick={(event) => {
      if (!(event.target as HTMLElement).closest('button, a, input, [role="dialog"]')) onSelect(row);
    }}>
      <td><button className={local.name} type="button" onClick={() => onSelect(row)} aria-label={`Открыть состав: ${row.name}`}>{row.name}</button></td>
      <td>{row.type === 'product' ? 'Продукт' : 'Полуфабрикат'}</td>
      <td data-numeric>{formatDecimal(row.current_quantity)}</td><td data-numeric>{row.unit}</td>

    </tr>)}</tbody>
  </table></div>;
}

function ProductSection({product, rows, onSelect}: {product: {id: string; name: string}; rows: StockRow[]; onSelect: (row: StockRow) => void}) {
  return <section className={local.section}>
    <header className={styles.row}><h2>{product.name}</h2></header>
    <ItemsTable rows={rows} onSelect={onSelect} />
  </section>;
}

export function ManufacturedItemsTableWidget() {
  const products = useProductOptionsQuery();
  const [productId, setProductId] = useState('');
  const [selected, setSelected] = useState<StockRow>();
  const rows = useStockRevisionRowsQuery({});
  const shown = productId ? (products.data ?? []).filter((p) => p.id === productId) : products.data ?? [];
  const orphans = (rows.data ?? []).filter((row) => row.type === 'semi_finished' && !row.products?.length);
  return <div className={styles.warehouse}>
    <div className={local.left}>
      <CreateManufacturedItemButton defaultProductId={productId} />
      <aside className={styles.sidebar} aria-label="Продукты">
        <Button selected={!productId} onClick={() => setProductId('')}>Все продукты</Button>
        {products.data?.map((p) => <Button key={p.id} selected={productId === p.id} onClick={() => setProductId(p.id)}>{p.name}</Button>)}
      </aside>
    </div>
    <div className={styles.form}>
      {(rows.isPending || products.isPending) && <div role="status">Загрузка позиций…</div>}
      {products.isError && <Alert theme="danger" message={getErrorMessage(products.error)} actions={<Button onClick={() => products.refetch()}>Повторить</Button>} />}
      {rows.isError && <Alert theme="danger" message={getErrorMessage(rows.error)} actions={<Button onClick={() => rows.refetch()}>Повторить</Button>} />}
      {rows.data && products.data && <>
        {!shown.length && !orphans.length && <p>Полуфабрикаты и продукты пока не добавлены</p>}
        {shown.map((product) => <ProductSection key={product.id} product={product} onSelect={setSelected}
          rows={rows.data.filter((row) => row.type === 'product' && row.id === product.id || row.type === 'semi_finished' && row.products?.some((p) => p.id === product.id))} />)}
        {!productId && orphans.length > 0 && <section className={local.section}>
          <h2>Полуфабрикаты без продукта</h2><p>Укажите продукт в настройках позиции.</p>
          <ItemsTable rows={orphans} onSelect={setSelected} />
        </section>}
      </>}
    </div>
    {selected && <CompositionDialog row={selected} onClose={() => setSelected(undefined)} />}
  </div>;
}

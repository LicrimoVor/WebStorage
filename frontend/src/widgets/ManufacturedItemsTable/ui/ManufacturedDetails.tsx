import {ArrowUpRightFromSquare} from '@gravity-ui/icons';
import {Alert, Button, Dialog, Icon} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {useAuthSessionQuery} from '@/entities/Auth';
import {useProductOptionsQuery, type ManufacturedItem} from '@/entities/ManufacturedItem';
import {EditManufacturedItemButton} from '@/features/EditManufacturedItem';
import {ProduceManufacturedItemButton} from '@/features/ProduceManufacturedItem';
import {ManufacturedInventoryHistoryButton} from '@/features/ViewManufacturedInventoryHistory';
import {DetailCardFooter, DetailCardImage, DetailCardMetrics} from '@/shared/ui/DetailCard';
import card from '@/shared/ui/DetailCard.module.scss';
import {apiRequest, getErrorMessage} from '@/shared/api';
import type {components} from '@/shared/api/generated/schema';
import {formatDecimal, formatDateTime} from '@/shared/lib';
import {canAccess} from '@/shared/lib/access';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';
import local from './ManufacturedItemsTable.module.scss';
import {ProductUnits} from './ProductUnits';
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';

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

export function ManufacturedDetails({row, onClose}: {row: {id: string; name: string; unit: string}; onClose: () => void}) {
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
        <DetailCardImage image={item.image} name={item.name} />
        <DetailCardMetrics items={[
          {label: 'Свободно', value: formatDecimal(item.free_quantity), unit: item.unit},
          {label: 'Требуется', value: formatDecimal(item.required_quantity), unit: item.unit},
          {label: 'Изготовить', value: formatDecimal(item.to_produce_quantity), unit: item.unit, warning: Number(item.to_produce_quantity) > 0},
        ]} />
        <dl className={card.metadata}>
          <div><dt>Тип</dt><dd>{item.is_product ? 'Продукт' : 'Полуфабрикат'}</dd></div>
          {!item.is_product && <div><dt>Продажа</dt><dd>{item.is_byproduct ? 'Побочный продукт: можно продавать' : 'Не продаётся'}</dd></div>}
          {!item.is_product && <div><dt>Продукт</dt><dd>{products.data?.find((p) => p.id === item.product_id)?.name ?? 'Не указан'}</dd></div>}
          <div><dt>Группы</dt><dd>{item.groups?.map((g) => g.name).join(', ') || 'Без группы'}</dd></div>
          <div><dt>Единица измерения</dt><dd>{item.unit}</dd></div>
          <div><dt>Статус</dt><dd>{item.archived ? 'В архиве' : 'Активный'}</dd></div>
          <div><dt>Создан</dt><dd>{formatDateTime(item.created_at)}</dd></div>
          <div><dt>Изменён</dt><dd>{formatDateTime(item.updated_at)}</dd></div>
        </dl>
      </>}
      {item?.is_product && <ProductUnits productId={item.id} />}
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
      {!item.archived && <DeleteEntityButton kind="manufactured_item" id={item.id} name={item.name} onDeleted={onClose} />}
      <ManufacturedInventoryHistoryButton item={item} />
    </>}</DetailCardFooter>
  </Dialog>;
}

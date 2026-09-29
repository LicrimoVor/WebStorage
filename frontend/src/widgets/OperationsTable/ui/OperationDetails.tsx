import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import type {Operation} from '@/entities/Operation';
import {operationGroupLabel, useOperationGroupsQuery} from '@/entities/OperationGroup/api';
import {DetailCardFooter, DetailCardMetrics} from '@/shared/ui/DetailCard';
import card from '@/shared/ui/DetailCard.module.scss';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatDecimal, formatMoney, formatDateTime} from '@/shared/lib';

export function OperationDetails({id, onClose, renderActions}: {
  id: string; onClose: () => void; renderActions: (operation: Operation) => ReactNode;
}) {
  const query = useQuery({queryKey: ['operations', 'detail', id], queryFn: () => apiRequest<Operation>(`/operations/${id}`)});
  const groups = useOperationGroupsQuery();
  const item = query.data;
  const group = groups.data?.find((g) => g.id === item?.group_id);
  return <Dialog open onClose={onClose} size="m">
    <Dialog.Header caption={item?.name ?? 'Карточка операции'} />
    <Dialog.Body><div className={card.body}>
      {query.isPending && <p role="status">Загрузка операции…</p>}
      {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} actions={<Button onClick={() => query.refetch()}>Повторить</Button>} />}
      {item && <>
        <DetailCardMetrics items={[
          {label: 'Необходимо', value: formatDecimal(item.required_quantity)},
          {label: 'Выполнено', value: formatDecimal(item.completed_quantity)},
          {label: 'Необходимое время', value: formatDecimal(item.required_time_minutes), unit: 'мин.'},
        ]} />
        <dl className={card.metadata}>
          <div><dt>Группа / подгруппа</dt><dd>{group ? operationGroupLabel(group, groups.data ?? []) : item.group_id ? 'Загрузка группы…' : 'Без группы'}</dd></div>
          <div><dt>Норма времени</dt><dd>{item.time_norm == null ? 'Не задана' : `${formatDecimal(item.time_norm)} мин/ед`}</dd></div>
          <div><dt>Ставка</dt><dd>{formatMoney(item.price_per_operation)}</dd></div>
          <div><dt>Статус</dt><dd>{item.archived ? 'В архиве' : 'Активная'}</dd></div>
          <div><dt>Создана</dt><dd>{formatDateTime(item.created_at)}</dd></div>
          <div><dt>Изменена</dt><dd>{formatDateTime(item.updated_at)}</dd></div>
        </dl>
        {groups.isError && <Alert theme="warning" message={getErrorMessage(groups.error)} />}
      </>}
    </div></Dialog.Body>
    <DetailCardFooter onClose={onClose}>{item && renderActions(item)}</DetailCardFooter>
  </Dialog>;
}

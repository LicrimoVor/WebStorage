import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {employeeKeys, type Employee} from '@/entities/Employee';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatMoney, formatDecimal, formatDateTime} from '@/shared/lib';
import {DetailCardFooter, DetailCardMetrics} from '@/shared/ui/DetailCard';
import card from '@/shared/ui/DetailCard.module.scss';

export function EmployeeDetails({id, onClose, renderActions}: {id: string; onClose: () => void; renderActions: (item: Employee) => ReactNode}) {
  const query = useQuery({queryKey: [...employeeKeys.all, 'detail', id], queryFn: () => apiRequest<Employee>(`/employees/${id}`)});
  const item = query.data;
  return <Dialog open onClose={onClose} size="m">
    <Dialog.Header caption={item?.full_name ?? 'Карточка сотрудника'} />
    <Dialog.Body><div className={card.body}>
      {query.isPending && <p role="status">Загрузка сотрудника…</p>}
      {query.error && <Alert theme="danger" message={getErrorMessage(query.error)} actions={<Button onClick={() => query.refetch()}>Повторить</Button>} />}
      {item && <>
        <DetailCardMetrics items={[
          {label: 'Начислено', value: formatMoney(item.accrued_total)},
          {label: 'Оплачено', value: formatMoney(item.paid_total)},
          {label: 'К оплате', value: formatMoney(item.payable_total)},
        ]} />
        <dl className={card.metadata}>
          <div><dt>Оплата</dt><dd>{item.compensation_type === 'hourly' ? 'Почасовая' : 'Сдельная'}</dd></div>
          <div><dt>Ставка в час</dt><dd>{item.hourly_rate ? formatMoney(item.hourly_rate) : 'Не задана'}</dd></div>
          <div><dt>Статус</dt><dd>{item.active ? 'Активен' : 'Неактивен'}</dd></div>
          <div><dt>Выполнено, экв.</dt><dd>{formatDecimal(item.completed_operations)}</dd></div>
          <div><dt>Оплачено, экв.</dt><dd>{formatDecimal(item.paid_operations_equivalent)}</dd></div>
          <div><dt>Комментарий</dt><dd>{item.comment || 'Не указан'}</dd></div>
          <div><dt>Добавлен</dt><dd>{formatDateTime(item.created_at)}</dd></div>
          <div><dt>Изменён</dt><dd>{formatDateTime(item.updated_at)}</dd></div>
        </dl>
      </>}
    </div></Dialog.Body>
    <DetailCardFooter onClose={onClose}>{item && renderActions(item)}</DetailCardFooter>
  </Dialog>;
}

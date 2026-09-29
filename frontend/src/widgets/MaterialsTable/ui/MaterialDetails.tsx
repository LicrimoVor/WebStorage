import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {materialKeys, type Material} from '@/entities/Material';
import {DetailCardFooter, DetailCardMetrics} from '@/shared/ui/DetailCard';
import card from '@/shared/ui/DetailCard.module.scss';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatDecimal, formatMoney} from '@/shared/lib';

export function MaterialDetails({id, onClose, renderActions}: {
  id: string; onClose: () => void; renderActions: (material: Material) => ReactNode;
}) {
  const query = useQuery({queryKey: materialKeys.detail(id), queryFn: () => apiRequest<Material>(`/materials/${id}`)});
  const item = query.data;
  return <Dialog open onClose={onClose} size="m">
    <Dialog.Header caption={item?.name ?? 'Карточка материала'} />
    <Dialog.Body><div className={card.body}>
      {query.isPending && <p role="status">Загрузка материала…</p>}
      {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} actions={<Button onClick={() => query.refetch()}>Повторить</Button>} />}
      {item && <>
        {item.image && <img src={item.image} alt={item.name} className={card.image} />}
        <DetailCardMetrics items={[
          {label: 'Свободно', value: formatDecimal(item.free_quantity), unit: item.unit},
          {label: 'Требуется', value: formatDecimal(item.required_quantity), unit: item.unit},
          {label: 'Дефицит', value: formatDecimal(item.deficit_quantity), unit: item.unit, warning: Number(item.deficit_quantity) > 0},
          {label: 'Брак при поступлении, всего', value: formatDecimal(item.defective_quantity ?? '0'), unit: item.unit},
        ]} />
        <dl className={card.metadata}>
          <div><dt>Группы</dt><dd>{item.groups?.map((g) => g.name).join(', ') || 'Без группы'}</dd></div>
          <div><dt>Единица измерения</dt><dd>{item.unit}</dd></div>
          <div><dt>Цена</dt><dd>{formatMoney(item.price)}</dd></div>
          <div><dt>Ссылка</dt><dd>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Открыть ссылку</a> : 'Не указана'}</dd></div>
          <div><dt>Статус</dt><dd>{item.archived ? 'В архиве' : 'Активный'}</dd></div>
        </dl>
      </>}
    </div></Dialog.Body>
    <DetailCardFooter onClose={onClose}>{item && renderActions(item)}</DetailCardFooter>
  </Dialog>;
}

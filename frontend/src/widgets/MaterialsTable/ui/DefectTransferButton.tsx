import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useRef, useState} from 'react';
import type {Material} from '@/entities/Material';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {TextInput} from '@/shared/ui/FormControls';
import {isDecimal, normalizeDecimal} from '@/shared/lib';
import card from '@/shared/ui/DetailCard.module.scss';

export function DefectTransferButton({material}: {material: Material}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, {quantity: string; comment: string}>>({});
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const query = useQuery({queryKey: ['materials', material.id, 'defects'], enabled: open,
    queryFn: () => apiRequest<Material[]>(`/materials/${material.id}/defects`)});
  const entries = Object.entries(values).filter(([, v]) => Number(normalizeDecimal(v.quantity)) > 0)
    .map(([id, v]) => ({material_id: id, quantity: normalizeDecimal(v.quantity), comment: v.comment}));
  const invalid = Object.values(values).some((v) => v.quantity && (!isDecimal(v.quantity) || Number(normalizeDecimal(v.quantity)) < 0));
  const mutation = useMutation({mutationFn: () => apiRequest(`/materials/${material.id}/defect-transfers`, {
    method: 'POST', body: JSON.stringify({request_id: key.current, entries}),
  }), onSuccess: async () => {await client.invalidateQueries(); setOpen(false);}});
  const title = material.source_material_id ? 'Перевести в целый' : 'Перевести в брак';
  const close = () => {if (!mutation.isPending) setOpen(false);};
  return <>
    <Button view="outlined" onClick={() => {key.current = crypto.randomUUID(); setValues({}); mutation.reset(); setOpen(true);}}>{title}</Button>
    <Dialog open={open} onClose={close} size="m"><Dialog.Header caption={title} />
      <Dialog.Body><div className={card.body}>
        <p>{material.name}: доступно {material.free_quantity} {material.unit}. Укажите количество для каждого вида. Пустые строки пропускаются.</p>
        {query.isPending && <p>Загрузка…</p>}
        {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} />}
        {query.data?.length === 0 && <Alert theme="info" message="Сначала создайте вид брака кнопкой «Новый брак» в карточке материала." />}
        {query.data?.map((target) => <fieldset key={target.id}><legend>{target.name}</legend><div className={card.body}>
          <TextInput label={`Количество, ${target.unit}`} value={values[target.id]?.quantity ?? ''} controlProps={{inputMode: 'decimal'}}
            onUpdate={(quantity) => setValues((v) => ({...v, [target.id]: {comment: v[target.id]?.comment ?? '', quantity}}))} />
          <TextInput label="Комментарий" value={values[target.id]?.comment ?? ''}
            onUpdate={(comment) => setValues((v) => ({...v, [target.id]: {quantity: v[target.id]?.quantity ?? '', comment}}))} />
        </div></fieldset>)}
        {mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
      </div></Dialog.Body>
      <Dialog.Footer textButtonApply="Перевести" textButtonCancel="Отмена" onClickButtonCancel={close}
        onClickButtonApply={() => mutation.mutate()} loading={mutation.isPending}
        propsButtonApply={{disabled: invalid || !entries.length || entries.reduce((sum, e) => sum + Number(e.quantity), 0) > Number(material.free_quantity)}} />
    </Dialog>
  </>;
}

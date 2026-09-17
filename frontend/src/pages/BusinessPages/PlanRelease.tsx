import { Alert, Button, Dialog, TextArea, TextInput } from '@gravity-ui/uikit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { registerProduction } from '@/entities/Production';
import type { ProductionPlan } from '@/entities/ProductionPlan';
import { getErrorMessage } from '@/shared/api';
import { ImageUploadField } from '@/shared/ui';
import styles from './BusinessPages.module.scss';

export function PlanRelease({ plan }: { plan: ProductionPlan }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [serials, setSerials] = useState('');
  const [photo, setPhoto] = useState('');
  const [comment, setComment] = useState('');
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const numbers = serials.split('\n').map((s) => s.trim()).filter(Boolean);
  const valid = Number.isInteger(Number(quantity)) && Number(quantity) > 0 &&
    Number(quantity) <= Number(plan.remaining_quantity) && numbers.length === Number(quantity) &&
    new Set(numbers).size === numbers.length;
  const mutation = useMutation({
    mutationFn: () => registerProduction(plan.id, {
      item_id: plan.product_id, quantity, serial_numbers: numbers,
      photo: photo || null, comment: comment.trim() || null,
    }, key.current),
    onSuccess: async () => {
      setOpen(false); setSerials(''); setPhoto(''); setComment('');
      key.current = crypto.randomUUID();
      await client.invalidateQueries();
    },
  });
  return <>
    <Button onClick={() => { mutation.reset(); setOpen(true); }}>Выпустить по плану</Button>
    <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)} maxWidth="m" fullWidth>
      <Dialog.Header caption={`Выпуск: ${plan.product_name}`} />
      <Dialog.Body>
        <div className={styles.form}>
          <p>Осталось по плану: {plan.remaining_quantity}. Версия техпроцесса: {plan.process_version_number}.</p>
          <p>Для сборки материалы и полуфабрикаты должны быть на складе.</p>
          <TextInput label="Количество изделий" value={quantity} onUpdate={setQuantity} />
          <TextArea placeholder="Номера изделий — каждый с новой строки" value={serials} onUpdate={setSerials} />
          <ImageUploadField value={photo} onUpdate={setPhoto} alt="Фото выпуска" />
          <TextInput label="Комментарий" value={comment} onUpdate={setComment} />
          {mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
        </div>
      </Dialog.Body>
      <Dialog.Footer textButtonApply="Выпустить" textButtonCancel="Отмена"
        onClickButtonApply={() => mutation.mutate()} onClickButtonCancel={() => setOpen(false)}
        propsButtonApply={{ disabled: !valid }} loading={mutation.isPending} />
    </Dialog>
  </>;
}

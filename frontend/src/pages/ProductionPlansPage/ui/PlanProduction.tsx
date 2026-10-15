import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useRef, useState} from 'react';
import {registerProduction} from '@/entities/Production';
import type {ProductionPlan} from '@/entities/ProductionPlan';
import {getErrorMessage} from '@/shared/api';
import {isDecimal, normalizeDecimal} from '@/shared/lib';
import {TextInput} from '@/shared/ui/FormControls';

export function PlanProduction({plan}: {plan: ProductionPlan}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const mutation = useMutation({mutationFn: () => registerProduction(plan.id, {item_id: plan.product_id, quantity: normalizeDecimal(quantity), serial_numbers: []}, key.current),
    onSuccess: async () => {await client.invalidateQueries(); setOpen(false); key.current = crypto.randomUUID();}});
  const valid = isDecimal(quantity) && Number(normalizeDecimal(quantity)) > 0 && Number(normalizeDecimal(quantity)) <= Number(plan.remaining_quantity);
  return <>
    <Button onClick={() => {mutation.reset(); setOpen(true);}}>Произвести по плану</Button>
    <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)} maxWidth="m" fullWidth>
      <Dialog.Header caption={`Производство: ${plan.product_name}`} />
      <Dialog.Body>
        <p>Сборка спишет комплектующие и добавит товары в свободный остаток. ID можно присвоить затем во вкладке «Выпуск продукции».</p>
        <TextInput label="Количество" value={quantity} onUpdate={setQuantity} controlProps={{inputMode: 'decimal', 'aria-label': 'Количество производства по плану'}} />
        {mutation.error && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
      </Dialog.Body>
      <Dialog.Footer textButtonApply="Произвести" textButtonCancel="Закрыть" loading={mutation.isPending} propsButtonApply={{disabled: !valid}}
        onClickButtonApply={() => mutation.mutate()} onClickButtonCancel={() => setOpen(false)} />
    </Dialog>
  </>;
}

import {Button, Dialog, Alert, Text} from '@gravity-ui/uikit';
import {Select, TextInput} from '@/shared/ui/FormControls';
import {useRef, useState} from 'react';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useProductOptionsQuery} from '@/entities/ManufacturedItem';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatDecimal} from '@/shared/lib';

export function ReleaseProductsButton({productId, productName, label = 'Выпуск продукции'}: {productId?: string; productName?: string; label?: string}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(productId ?? '');
  const [numbers, setNumbers] = useState(['']);
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const products = useProductOptionsQuery(open, 'saleable');
  const item = products.data?.find((product) => product.id === selected);
  const mutation = useMutation({mutationFn: () => apiRequest('/product-releases', {method: 'POST',
    headers: {'Idempotency-Key': key.current}, body: JSON.stringify({product_id: selected, serial_numbers: numbers})}),
    onSuccess: async () => {await client.invalidateQueries(); setOpen(false); setNumbers(['']); key.current = crypto.randomUUID();}});
  const valid = selected && numbers.every((number) => number.trim() && number.length <= 200) && new Set(numbers).size === numbers.length &&
    item && numbers.length <= Number(item.free_quantity);
  return <>
    <Button view="action" onClick={() => {mutation.reset(); setOpen(true);}}>{label}</Button>
    <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)} maxWidth="m" fullWidth>
      <Dialog.Header caption={productName ? `Выпуск: ${productName}` : 'Выпуск продукции'} />
      <Dialog.Body>
        {!productId && <Select label="Продукт" aria-label="Продукт для выпуска" width="max" filterable
          loading={products.isPending} value={selected ? [selected] : []} onUpdate={(ids) => setSelected(ids[0] ?? '')}
          options={(products.data ?? []).map((product) => ({value: product.id, content: product.name}))} />}
        <p>Выпуск присваивает ID товарам из свободного остатка. Материалы и операции не расходуются.</p>
        {item && <Text>Свободный остаток: {formatDecimal(item.free_quantity)} {item.unit}</Text>}
        {numbers.map((number, index) => <div key={index} style={{display: 'flex', gap: 8, marginBlock: 12}}>
          <TextInput label={`ID изделия ${index + 1}`} value={number} onUpdate={(value) => setNumbers((current) => current.map((entry, i) => i === index ? value : entry))}
            controlProps={{'aria-label': `ID изделия ${index + 1}`, maxLength: 200}} />
          <Button disabled={numbers.length === 1 || mutation.isPending} onClick={() => setNumbers((current) => current.filter((_, i) => i !== index))}>Убрать</Button>
        </div>)}
        <Button disabled={mutation.isPending || numbers.length >= 10000} onClick={() => setNumbers([...numbers, ''])}>Добавить ID</Button>
        <p>Каждая строка — одна единица продукции. Поддерживаются буквы, цифры, пробелы и специальные символы.</p>
        {(products.error || mutation.error) && <Alert theme="danger" message={getErrorMessage(products.error ?? mutation.error)} />}
      </Dialog.Body>
      <Dialog.Footer textButtonApply="Выпустить" textButtonCancel="Закрыть" loading={mutation.isPending}
        propsButtonApply={{disabled: !valid}} onClickButtonApply={() => mutation.mutate()} onClickButtonCancel={() => setOpen(false)} />
    </Dialog>
  </>;
}

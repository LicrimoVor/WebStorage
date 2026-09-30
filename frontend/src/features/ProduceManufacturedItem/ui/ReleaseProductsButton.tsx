import {Button, Dialog, Alert} from '@gravity-ui/uikit';
import {Select} from '@/shared/ui/FormControls';
import {useState} from 'react';
import {useProductOptionsQuery} from '@/entities/ManufacturedItem';
import {getErrorMessage} from '@/shared/api';
import {ProduceManufacturedItemButton} from './ProduceManufacturedItemButton';

export function ReleaseProductsButton() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const products = useProductOptionsQuery(open, 'saleable');
  const item = products.data?.find((product) => product.id === selected[0]);
  return <>
    <Button view="action" onClick={() => setOpen(true)}>Выпуск продукции</Button>
    <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="warehouse-release-title">
      <Dialog.Header caption="Выпуск продукции" id="warehouse-release-title" />
      <Dialog.Body>
        <Select label="Продукт" aria-label="Продукт для выпуска" width="max" filterable
          loading={products.isPending} value={selected} onUpdate={setSelected}
          options={(products.data ?? []).map((product) => ({value: product.id, content: product.name}))} />
        {products.isError && <Alert theme="danger" message={getErrorMessage(products.error)} />}
      </Dialog.Body>
      <Dialog.Footer>
        {item && <ProduceManufacturedItemButton itemId={item.id} itemName={item.name} serialized={item.is_product} label="Выпустить" />}
        <Button onClick={() => setOpen(false)}>Закрыть</Button>
      </Dialog.Footer>
    </Dialog>
  </>;
}

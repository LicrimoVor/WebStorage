import {Alert, Button, Dialog, Loader, Pagination, Text} from '@gravity-ui/uikit';
import {useState} from 'react';
import {useManufacturedItemsQuery, type ManufacturedItem} from '@/entities/ManufacturedItem';
import {getErrorMessage} from '@/shared/api';
import {formatDecimal} from '@/shared/lib';
import {TextInput} from '@/shared/ui/FormControls';
import {ProductUnits} from '@/widgets/ManufacturedItemsTable/ui/ProductUnits';
import styles from './ReleasedStock.module.scss';

export function ReleasedStock() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ManufacturedItem>();
  const query = useManufacturedItemsQuery({kind: 'saleable', released_only: true, page, page_size: 20, search, sort_by: 'name', sort_order: 'asc'});
  return <main className={styles.root}>
    <Text as="h1" variant="display-1">Склад выпущенной продукции</Text>
    <Text color="secondary">Изделия с ID, доступные для продажи. Нажмите на продукт, чтобы посмотреть ID.</Text>
    <TextInput label="Поиск продукта" value={search} onUpdate={(value) => {setSearch(value); setPage(1);}} hasClear />
    {query.isPending && <Loader />}
    {query.error && <Alert theme="danger" message={getErrorMessage(query.error)} />}
    {query.data && <>
      {!query.data.items.length ? <Text>Выпущенной продукции на складе нет.</Text> : <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th>Продукт</th><th>Выпущенные на складе</th></tr></thead>
        <tbody>{query.data.items.map((item) => <tr key={item.id} tabIndex={0} onClick={() => setSelected(item)}
          onKeyDown={(event) => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); setSelected(item);}}}>
          <td><Button view="flat" onClick={() => setSelected(item)}>{item.name}</Button></td><td>{formatDecimal(String(item.released_quantity))} {item.unit}</td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination page={page} pageSize={20} total={query.data.total} onUpdate={setPage} />
    </>}
    <Dialog open={Boolean(selected)} onClose={() => setSelected(undefined)} maxWidth="l" fullWidth>
      <Dialog.Header caption={`На складе: ${selected?.name ?? ''}`} />
      <Dialog.Body>{selected && <ProductUnits key={selected.id} productId={selected.id} availableOnly />}</Dialog.Body>
      <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setSelected(undefined)} />
    </Dialog>
  </main>;
}

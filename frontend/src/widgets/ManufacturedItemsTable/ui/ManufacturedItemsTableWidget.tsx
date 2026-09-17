import { Alert, Button } from '@gravity-ui/uikit';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStockRevisionRowsQuery } from '@/entities/StockRevision';
import { useProductOptionsQuery, type ManufacturedItem } from '@/entities/ManufacturedItem';
import { CreateManufacturedItemButton } from '@/features/CreateManufacturedItem';
import { EditManufacturedItemButton } from '@/features/EditManufacturedItem';
import { ProduceManufacturedItemButton } from '@/features/ProduceManufacturedItem';
import { ManufacturedInventoryHistoryButton } from '@/features/ViewManufacturedInventoryHistory';
import { apiRequest, getErrorMessage } from '@/shared/api';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';

function ItemActions({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ enabled: open, queryKey: ['manufactured-items', 'detail', id], queryFn: () => apiRequest<ManufacturedItem>(`/manufactured-items/${id}`) });
  if (!open) return <Button size="s" onClick={() => setOpen(true)}>Действия</Button>;
  return query.data ? <div className={styles.row}>
    <EditManufacturedItemButton item={query.data} />
    <ManufacturedInventoryHistoryButton item={query.data} />
  </div> : null;
}

export function ManufacturedItemsTableWidget() {
  const products = useProductOptionsQuery();
  const [productId, setProductId] = useState('');
  const rows = useStockRevisionRowsQuery({});
  const shown = productId ? (products.data ?? []).filter((p) => p.id === productId) : products.data ?? [];
  const orphans = (rows.data ?? []).filter((row) => row.type === 'semi_finished' && !row.products?.length);
  return <div className={styles.warehouse}>
    <aside className={styles.sidebar}>
      <Button selected={!productId} onClick={() => setProductId('')}>Все продукты</Button>{products.data?.map((p) => <Button key={p.id} selected={productId === p.id} onClick={() => setProductId(p.id)}>{p.name}</Button>)}</aside>
    <div className={styles.form}>
      <CreateManufacturedItemButton />
      {rows.isPending && <div role="status" aria-label="Загрузка позиций">Загрузка…</div>}
      {rows.data?.length === 0 && <p>Полуфабрикаты и продукты пока не добавлены</p>}
      {rows.isError && <Alert theme="danger" message={getErrorMessage(rows.error)} actions={<Button onClick={() => rows.refetch()}>Повторить</Button>} />}
      {shown.map((product) => <section key={product.id}>
        <h2>{product.name}</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Позиция</th>
              <th>Остаток</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>{(rows.data ?? []).filter((row) => row.id === product.id || row.type === 'semi_finished' && row.products?.some((p) => p.id === product.id)).map((row) => <tr key={row.id}>
            <td>{row.id === product.id ? 'Продукт: ' : '↳ '}{row.name}</td>
            <td>{row.current_quantity} {row.unit}</td>
            <td>{row.type === 'semi_finished' && <ProduceManufacturedItemButton itemId={row.id} itemName={row.name} />}<ItemActions id={row.id} />
            </td>
          </tr>)}</tbody>
        </table>
      </section>)}
      {orphans.length > 0 && <section>
        <h2>Укажите продукт для существующих полуфабрикатов</h2>{orphans.map((row) => <div key={row.id} className={styles.row}>{row.name}<ItemActions id={row.id} />
        </div>)}</section>}
    </div>
  </div>;
}

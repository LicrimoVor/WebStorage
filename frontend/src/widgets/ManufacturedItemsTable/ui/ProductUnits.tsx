import {Alert, Button} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatDateTime} from '@/shared/lib';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';

interface Unit {id: string; serial_number: string | null; sale_id: string | null; issued_for_repair_id: string | null; photo: string | null; created_at: string}

export function ProductUnits({productId}: {productId: string}) {
  const [page, setPage] = useState(0);
  const query = useQuery({queryKey: ['product-units', productId, page], queryFn: () => apiRequest<Unit[]>(`/product-units?product_id=${productId}&offset=${page * 50}&limit=50`)});
  return <section className={styles.form}>
    <h3>Выпущенные изделия</h3>
    <p>Каждое изделие имеет внутренний ID. Заводской номер необязателен. Здесь показаны и доступные, и уже выданные изделия.</p>
    {query.isPending && <p role="status">Загрузка изделий…</p>}
    {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} actions={<Button onClick={() => query.refetch()}>Повторить</Button>} />}
    {query.data && <>
      {!query.data.length ? <p>Выпущенных изделий на этой странице нет.</p> : <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th>Номер</th><th>ID</th><th>Дата выпуска</th><th>Статус</th><th>Фото</th></tr></thead>
        <tbody>{query.data.map((unit) => <tr key={unit.id}>
          <td>{unit.serial_number || 'Без номера'}</td><td title={unit.id}>{unit.id}</td>
          <td>{formatDateTime(unit.created_at)}</td><td>{unit.sale_id ? 'Продано' : unit.issued_for_repair_id ? 'Выдано на замену' : 'На складе'}</td>
          <td>{unit.photo ? <a href={unit.photo} target="_blank" rel="noreferrer">Открыть фото</a> : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className={styles.row}><Button disabled={!page} onClick={() => setPage(page - 1)}>Назад</Button><span>Страница {page + 1}</span><Button disabled={query.data.length < 50} onClick={() => setPage(page + 1)}>Далее</Button></div>
    </>}
  </section>;
}

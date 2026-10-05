import {Alert, Button, Loader, Pagination, Table, type TableColumnConfig} from '@gravity-ui/uikit';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatDateTime} from '@/shared/lib';

import styles from './TrashPage.module.scss';

interface TrashEntry {
  id: string; entity_type: string; name: string; deleted_at: string; deleted_by: string;
}
const labels: Record<string, string> = {
  material: 'Материал', manufactured_item: 'Полуфабрикат / продукт',
  operation: 'Операция', employee: 'Сотрудник', process: 'Техпроцесс',
  finance_entry: 'Финансовая операция', inventory_group: 'Группа / подгруппа',
  funding_source: 'Источник финансирования', instruction_asset: 'Файл инструкции',
  production_plan: 'Производственный план',
  operation_group: 'Группа операций',
};

export function TrashPage() {
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const query = useQuery({queryKey: ['trash', page], queryFn: ({signal}) =>
    apiRequest<{items: TrashEntry[]; total: number}>(`/trash?page=${page}&page_size=50`, {signal})});
  const restore = useMutation({
    mutationFn: (id: string) => apiRequest(`/trash/${id}/restore`, {method: 'POST'}),
    onSuccess: async () => {
      if (query.data?.items.length === 1 && page > 1) setPage(page - 1);
      await client.invalidateQueries();
    },
  });
  const columns: TableColumnConfig<TrashEntry>[] = [
    {id: 'name', name: 'Название'},
    {id: 'entity_type', name: 'Тип', template: (row) => labels[row.entity_type] ?? row.entity_type},
    {id: 'deleted_at', name: 'Удалено', template: (row) => formatDateTime(row.deleted_at)},
    {id: 'deleted_by', name: 'Автор удаления'},
    {id: 'actions', name: '', template: (row) => <Button disabled={restore.isPending}
      loading={restore.isPending && restore.variables === row.id}
      onClick={() => restore.mutate(row.id)}>Восстановить</Button>},
  ];
  return <main className={styles.root}>
    <h1>Корзина</h1>
    <p>Удалённые записи можно восстановить вместе с их сохранёнными данными и связями.</p>
    {query.isPending && <Loader />}
    {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)}
      actions={<Button onClick={() => query.refetch()}>Повторить</Button>} />}
    {restore.isError && <Alert theme="danger" message={getErrorMessage(restore.error)} />}
    {query.data && (query.data.total ? <>
      <div className={styles.table}><Table data={query.data.items} columns={columns} /></div>
      <Pagination page={page} pageSize={50} total={query.data.total} onUpdate={setPage} />
    </> : <p>Корзина пуста.</p>)}
  </main>;
}

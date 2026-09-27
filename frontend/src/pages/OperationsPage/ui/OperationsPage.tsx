import {Alert, Button} from '@gravity-ui/uikit';
import {useSearchParams} from 'react-router-dom';
import {OperationsTableWidget} from '@/widgets/OperationsTable';
import {useOperationGroupsQuery} from '@/entities/OperationGroup/api';
import {ManageOperationGroups} from '@/entities/OperationGroup/ManageOperationGroups';
import {getErrorMessage} from '@/shared/api';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';

export function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const groups = useOperationGroupsQuery();
  const current = params.get('group_id') ?? '';
  const select = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('group_id', value); else next.delete('group_id');
    next.set('page', '1'); setParams(next);
  };
  return <main className={styles.page}>
    <header className={styles.row}><h1>Операции</h1><ManageOperationGroups /></header>
    <p>Справочник работ: выберите группу, настройте нормы и ставки, зарегистрируйте выполнение.</p>
    <div className={styles.warehouse}>
      <aside className={styles.sidebar} aria-label="Группы операций">
        <Button selected={!current} onClick={() => select('')}>Все операции</Button>
        <Button view="flat" selected={current === 'none'} onClick={() => select('none')}>Без группы</Button>
        {groups.data?.map((group) => <Button key={group.id} view="flat" selected={current === group.id} onClick={() => select(group.id)}>{group.name}</Button>)}
        {groups.isError && <Alert theme="danger" message={getErrorMessage(groups.error)} />}
      </aside>
      <OperationsTableWidget />
    </div>
  </main>;
}

import { Button } from '@gravity-ui/uikit';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MaterialsTableWidget } from '@/widgets/MaterialsTable';
import { ManufacturedItemsTableWidget } from '@/widgets/ManufacturedItemsTable';
import { ManageInventoryGroupsButton } from '@/features/ManageInventoryGroups';
import { useInventoryGroupsQuery } from '@/entities/InventoryGroup';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';

export function WarehousePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const groups = useInventoryGroupsQuery();
  const manufactured = params.get('tab') === 'manufactured';
  const select = (id: string) => { const next = new URLSearchParams(params); next.set('group_id', id); next.set('page', '1'); setParams(next); };
  return <main className={styles.page}>
    <div className={styles.row}>
      <h1>Склад</h1>
      <ManageInventoryGroupsButton />
      <Button onClick={() => navigate('/warehouse/revision')}>Ревизия</Button>
      <Button view="action" onClick={() => navigate('/warehouse/receipt')}>Приход</Button>
    </div>
    <div className={styles.row}>
      <Button selected={!manufactured} onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'materials'); setParams(next); }}>Материалы</Button>
      <Button selected={manufactured} onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'manufactured'); setParams(next); }}>Полуфабрикаты и продукты</Button>
    </div>
    {manufactured ? <ManufacturedItemsTableWidget /> : <div className={styles.warehouse}>
      <aside className={styles.sidebar} aria-label="Группы материалов">
        <Button selected={!params.get('group_id')} onClick={() => select('')}>Все материалы</Button>{(groups.data ?? []).filter((g) => !g.parent_id).map((parent) => <div key={parent.id}>
          <Button view="flat" selected={params.get('group_id') === parent.id} onClick={() => select(parent.id)}>{parent.name}</Button>
          <div style={{ paddingLeft: 20 }}>{(groups.data ?? []).filter((g) => g.parent_id === parent.id).map((child) => <div key={child.id}>
            <Button view="flat" selected={params.get('group_id') === child.id} onClick={() => select(child.id)}>{child.name}</Button>
          </div>)}</div>
        </div>)}</aside>
      <MaterialsTableWidget />
    </div>}
  </main>;
}

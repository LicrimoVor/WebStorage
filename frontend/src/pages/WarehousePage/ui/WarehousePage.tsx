import { Button } from '@gravity-ui/uikit';
import { ImportCatalogButton } from '@/features/ImportCatalog/ImportCatalogButton';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MaterialsTableWidget } from '@/widgets/MaterialsTable';
import { ManufacturedItemsTableWidget } from '@/widgets/ManufacturedItemsTable';
import { ManageInventoryGroupsButton } from '@/features/ManageInventoryGroups';
import { useInventoryGroupsQuery } from '@/entities/InventoryGroup';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';
import tree from './WarehouseTree.module.scss';

export function WarehousePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const groups = useInventoryGroupsQuery();
  const manufactured = params.get('tab') === 'manufactured';
  const select = (id: string) => { const next = new URLSearchParams(params); next.set('group_id', id); next.set('page', '1'); setParams(next); };
  return <main className={styles.page}>
    <div className={styles.row}>
      <h1>Склад</h1>
      <ImportCatalogButton kind="warehouse" />
      <ManageInventoryGroupsButton defaultParentId={groups.data?.find((g) => g.id === params.get('group_id'))?.parent_id || params.get('group_id') || ''} />
      <Button onClick={() => navigate('/warehouse/revision')}>Ревизия</Button>
      <Button view="action" onClick={() => navigate('/warehouse/receipt')}>Приход</Button>
    </div>
    <div className={styles.row}>
      <Button selected={!manufactured} onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'materials'); setParams(next); }}>Материалы</Button>
      <Button selected={manufactured} onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'manufactured'); setParams(next); }}>Полуфабрикаты и продукты</Button>
    </div>
    {manufactured ? <ManufacturedItemsTableWidget /> : <div className={styles.warehouse}>
      <aside className={styles.sidebar} aria-label="Группы материалов">
        <nav className={tree.tree} aria-label="Фильтр по группе материалов">
          <button type="button" className={`${tree.node} ${tree.root}`} aria-pressed={!params.get('group_id')} onClick={() => select('')}>Все материалы</button>
          <ul className={tree.branches}>
            {(groups.data ?? []).filter((g) => !g.parent_id).map((parent) => {
              const children = (groups.data ?? []).filter((g) => g.parent_id === parent.id);
              return <li key={parent.id} className={tree.branch}>
                <button type="button" className={tree.node} aria-pressed={params.get('group_id') === parent.id} onClick={() => select(parent.id)}>{parent.name}</button>
                {children.length > 0 && <ul className={tree.branches}>
                  {children.map((child) => <li key={child.id} className={tree.branch}>
                    <button type="button" className={tree.node} aria-pressed={params.get('group_id') === child.id} onClick={() => select(child.id)}>{child.name}</button>
                  </li>)}
                </ul>}
              </li>;
            })}
          </ul>
        </nav>
      </aside>
      <MaterialsTableWidget />
    </div>}
  </main>;
}

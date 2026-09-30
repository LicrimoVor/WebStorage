import { Button } from '@gravity-ui/uikit';
import { ImportCatalogButton } from '@/features/ImportCatalog/ImportCatalogButton';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MaterialsTableWidget } from '@/widgets/MaterialsTable';
import { ManageInventoryGroupsButton } from '@/features/ManageInventoryGroups';
import { useInventoryGroupsQuery } from '@/entities/InventoryGroup';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';
import tree from './WarehouseTree.module.scss';

export function WarehousePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const groups = useInventoryGroupsQuery();
  const tab = params.get('tab') === 'products' ? 'products' : 'materials';
  const setTab = (value: string) => {const next = new URLSearchParams(); next.set('tab', value); setParams(next);};
  const select = (id: string, ungrouped = false) => { const next = new URLSearchParams(params); next.set('group_id', id); if (ungrouped) next.set('ungrouped', 'true'); else next.delete('ungrouped'); next.set('page', '1'); setParams(next); };
  return <main className={styles.page}>
    <div className={styles.row}>
      <h1>Склад</h1>
      <ImportCatalogButton kind="warehouse" />
      <ManageInventoryGroupsButton defaultParentId={groups.data?.find((g) => g.id === params.get('group_id'))?.parent_id || params.get('group_id') || ''} />
      <Button onClick={() => navigate('/warehouse/revision')}>Ревизия</Button>
      <Button view="action" onClick={() => navigate('/warehouse/receipt')}>Приход</Button>
    </div>
    <div className={styles.row}>
      <Button selected={tab === 'materials'} onClick={() => setTab('materials')}>Материалы</Button>
      <Button selected={tab === 'products'} onClick={() => setTab('products')}>Продукты</Button>
    </div>
    {tab === 'products' ? <MaterialsTableWidget key={tab} kind="product" /> : <div className={styles.warehouse}>
      <div className={tree.sidebarColumn}>
      <aside className={styles.sidebar} aria-label="Группы материалов">
        <nav className={tree.tree} aria-label="Фильтр по группе материалов">
          <button type="button" className={`${tree.node} ${tree.root}`} aria-pressed={!params.get('group_id') && params.get('ungrouped') !== 'true'} onClick={() => select('')}>Все материалы</button>
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
            <li className={tree.branch}>
              <button type="button" className={tree.node} aria-pressed={params.get('ungrouped') === 'true'} onClick={() => select('', true)}>Без группы</button>
            </li>
          </ul>
        </nav>
      </aside>
      </div>
      <MaterialsTableWidget key={tab} kind="all" />
    </div>}
  </main>;
}

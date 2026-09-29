import styles from './GroupTree.module.scss';

export function GroupTree({groups, selected, onSelect, allLabel, ungrouped = false}: {
  groups: {id: string; name: string; parent_id?: string | null}[];
  selected: string; onSelect: (id: string) => void; allLabel: string; ungrouped?: boolean;
}) {
  return <nav className={styles.tree} aria-label={allLabel}>
    <button type="button" className={`${styles.node} ${styles.root}`} aria-pressed={!selected} onClick={() => onSelect('')}>{allLabel}</button>
    <ul className={styles.branches}>
      {ungrouped && <li className={styles.branch}><button type="button" className={styles.node} aria-pressed={selected === 'none'} onClick={() => onSelect('none')}>Без группы</button></li>}
      {groups.filter((g) => !g.parent_id).map((parent) => {
        const children = groups.filter((g) => g.parent_id === parent.id);
        return <li key={parent.id} className={styles.branch}>
          <button type="button" className={styles.node} aria-pressed={selected === parent.id} onClick={() => onSelect(parent.id)}>{parent.name}</button>
          {children.length > 0 && <ul className={styles.branches}>{children.map((child) => <li key={child.id} className={styles.branch}>
            <button type="button" className={styles.node} aria-pressed={selected === child.id} onClick={() => onSelect(child.id)} title={`${parent.name} / ${child.name}`}>{child.name}</button>
          </li>)}</ul>}
        </li>;
      })}
    </ul>
  </nav>;
}

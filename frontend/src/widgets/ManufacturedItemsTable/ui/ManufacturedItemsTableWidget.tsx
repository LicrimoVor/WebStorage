import {ManufacturedItemsSection} from './ManufacturedItemsSection';
import styles from './ManufacturedItemsTableWidget.module.scss';

export function ManufacturedItemsTableWidget() {
  return (
    <div className={styles.sections}>
      <ManufacturedItemsSection
        kind="semi_finished"
        title="Полуфабрикаты"
        prefix="semi"
      />
      <ManufacturedItemsSection
        kind="product"
        title="Продукты"
        prefix="product"
      />
    </div>
  );
}

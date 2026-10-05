import { Button, Checkbox, Table, Text, type TableColumnConfig } from "@gravity-ui/uikit";

import { formatDecimal } from "@/shared/lib";

import type { Material } from "../model/types";
import {catalogRowId} from '../model/selection';
import { MaterialImage } from "./MaterialImage";
import styles from "./MaterialsTable.module.scss";

interface MaterialsTableProps {
  items: (Material & {kind?: string})[];
  onSelect: (material: Material) => void;
  selectedIds?: string[];
  onSelectionChange?: ((ids: string[]) => void) | undefined;
  selectionDisabled?: boolean;
}

export function MaterialsTable({ items, onSelect, selectedIds = [], onSelectionChange, selectionDisabled }: MaterialsTableProps) {
  const visibleIds = items.map(catalogRowId);
  const checkedCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const columns: TableColumnConfig<Material & {kind?: string}>[] = [
    ...(onSelectionChange ? [{
      id: 'selection',
      name: () => <Checkbox controlProps={{'aria-label': 'Выбрать все строки'}} disabled={selectionDisabled}
        checked={items.length > 0 && checkedCount === items.length}
        indeterminate={checkedCount > 0 && checkedCount < items.length}
        onUpdate={(checked) => onSelectionChange(checked
          ? [...new Set([...selectedIds, ...visibleIds])]
          : selectedIds.filter((id) => !visibleIds.includes(id)))} />,
      width: 48,
      template: (item: Material & {kind?: string}) => <Checkbox
        controlProps={{'aria-label': `Выбрать: ${item.name}`}} disabled={selectionDisabled}
        checked={selectedIds.includes(catalogRowId(item))}
        onUpdate={(checked) => onSelectionChange(checked
          ? [...selectedIds, catalogRowId(item)]
          : selectedIds.filter((id) => id !== catalogRowId(item)))} />,
    }] : []),
    {
      id: "image",
      name: "Изображение",
      width: 96,
      template: (item) => <MaterialImage image={item.image} name={item.name} />,
    },
    {
      id: "name",
      name: "Название",
      primary: true,
      template: (item) => <><Button view="flat" onClick={() => onSelect(item)}>{item.name}</Button>{item.kind === 'semi_finished' && <Text color="secondary"> · Полуфабрикат</Text>}{item.source_material_id && <Text color="secondary"> · Брак</Text>}</>,
    },
    {
      id: "groups",
      name: "Группы",
      template: (item) => item.groups?.map((group) => group.name).join(", ") || "—",
    },
    {
      id: "free_quantity",
      name: "Свободно",
      align: "center",
      template: (item) => formatDecimal(item.free_quantity),
    },
    {
      id: "required_quantity",
      name: "Требуется",
      align: "center",
      template: (item) => formatDecimal(item.required_quantity),
    },
    {
      id: "deficit_quantity",
      name: "Дефицит",
      align: "center",
      template: (item) => (
        <Text
          color={item.deficit_quantity === "0.000000" ? "secondary" : "danger"}
        >
          {formatDecimal(item.deficit_quantity)}
        </Text>
      ),
    },
  ];

  return (
    <div className={styles.scrollArea}>
      <Table
        className={styles.table}
        data={items}
        columns={columns}
        getRowDescriptor={(item) => ({id: catalogRowId(item), classNames: selectedIds.includes(catalogRowId(item)) ? [styles.selectedRow] : []})}
        verticalAlign="middle"
        onRowClick={(item, _index, event) => {
          if (!(event.target as HTMLElement).closest('button, input, label')) onSelect(item);
        }}
      />
    </div>
  );
}

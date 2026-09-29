import { Button, Table, Text, type TableColumnConfig } from "@gravity-ui/uikit";

import { formatDecimal } from "@/shared/lib";

import type { Material } from "../model/types";
import { MaterialImage } from "./MaterialImage";
import styles from "./MaterialsTable.module.scss";

interface MaterialsTableProps {
  items: Material[];
  onSelect: (material: Material) => void;
}

export function MaterialsTable({ items, onSelect }: MaterialsTableProps) {
  const columns: TableColumnConfig<Material>[] = [
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
      template: (item) => <Button view="flat" onClick={() => onSelect(item)}>{item.name}</Button>,
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
    {
      id: "defective_quantity",
      name: "Брак",
      align: "center",
      template: (item) => formatDecimal(item.defective_quantity ?? '0'),
    },
  ];

  return (
    <div className={styles.scrollArea}>
      <Table
        className={styles.table}
        data={items}
        columns={columns}
        getRowId={(item) => item.id}
        verticalAlign="middle"
        onRowClick={(item, _index, event) => {
          if (!(event.target as HTMLElement).closest('button')) onSelect(item);
        }}
      />
    </div>
  );
}

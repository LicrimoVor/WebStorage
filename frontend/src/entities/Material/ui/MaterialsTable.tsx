import { Link, Table, Text, type TableColumnConfig } from "@gravity-ui/uikit";
import type { ReactNode } from "react";

import { formatDecimal, formatMoney } from "@/shared/lib";

import type { Material } from "../model/types";
import { MaterialImage } from "./MaterialImage";
import styles from "./MaterialsTable.module.scss";

interface MaterialsTableProps {
  items: Material[];
  renderActions: (material: Material) => ReactNode;
}

export function MaterialsTable({ items, renderActions }: MaterialsTableProps) {
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
      template: (item) => <Text variant="body-2">{item.name}</Text>,
    },
    {
      id: "free_quantity",
      name: "Свободно",
      align: "end",
      template: (item) => formatDecimal(item.free_quantity),
    },
    {
      id: "required_quantity",
      name: "Требуется",
      align: "end",
      template: (item) => formatDecimal(item.required_quantity),
    },
    {
      id: "deficit_quantity",
      name: "Дефицит",
      align: "end",
      template: (item) => (
        <Text
          color={item.deficit_quantity === "0.000000" ? "secondary" : "danger"}
        >
          {formatDecimal(item.deficit_quantity)}
        </Text>
      ),
    },
    { id: "unit", name: "Единица" },
    {
      id: "price",
      name: "Цена",
      align: "end",
      template: (item) => formatMoney(item.price),
    },
    {
      id: "url",
      name: "Ссылка",
      template: (item) =>
        item.url ? (
          <Link href={item.url} target="_blank" rel="noreferrer">
            Открыть
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      name: "Действия",
      sticky: "end",
      template: renderActions,
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
      />
    </div>
  );
}

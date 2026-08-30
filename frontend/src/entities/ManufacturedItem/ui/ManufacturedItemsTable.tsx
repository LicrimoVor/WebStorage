import { Table, Text, type TableColumnConfig } from "@gravity-ui/uikit";
import type { ReactNode } from "react";

import { formatDecimal } from "@/shared/lib";

import type { ManufacturedItem } from "../model/types";
import { ManufacturedItemImage } from "./ManufacturedItemImage";
import styles from "./ManufacturedItemsTable.module.scss";

interface ManufacturedItemsTableProps {
  items: ManufacturedItem[];
  renderActions: (item: ManufacturedItem) => ReactNode;
}

export function ManufacturedItemsTable({
  items,
  renderActions,
}: ManufacturedItemsTableProps) {
  const columns: TableColumnConfig<ManufacturedItem>[] = [
    {
      id: "image",
      name: "Изображение",
      width: 96,
      template: (item) => (
        <ManufacturedItemImage image={item.image} name={item.name} />
      ),
    },
    {
      id: "name",
      name: "Название",
      primary: true,
      template: (item) => <Text variant="body-2">{item.name}</Text>,
    },
    {
      id: "groups",
      name: "Группы",
      template: (item) => item.groups?.map((group) => group.name).join(", ") || "—",
    },
    // {
    //   id: "kind",
    //   name: "Тип",
    //   template: (item) => (
    //     <Label theme={item.is_product ? "success" : "info"}>
    //       {item.is_product ? "Продукт" : "Полуфабрикат"}
    //     </Label>
    //   ),
    // },
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
      id: "to_produce_quantity",
      name: "Произвести",
      align: "end",
      template: (item) => formatDecimal(item.to_produce_quantity),
    },
    { id: "components", name: "Состав", template: () => "—" },
    { id: "operations", name: "Операции", template: () => "—" },
    { id: "unit", name: "Единица" },
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

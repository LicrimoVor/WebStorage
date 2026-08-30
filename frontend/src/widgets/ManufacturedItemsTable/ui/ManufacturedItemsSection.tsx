import { Boxes3 } from "@gravity-ui/icons";
import {
  Alert,
  Button,
  Card,
  Pagination,
  PlaceholderContainer,
  Select,
  Skeleton,
  Text,
  TextInput,
} from "@gravity-ui/uikit";
import { useSearchParams } from "react-router-dom";

import {
  ManufacturedItemsTable,
  useManufacturedItemsQuery,
  useProductOptionsQuery,
  type AvailabilityFilter,
  type ManufacturedItem,
  type ManufacturedItemKind,
  type ManufacturedItemListParams,
  type ManufacturedItemSortField,
  type SortOrder,
} from "@/entities/ManufacturedItem";
import { useInventoryGroupsQuery } from "@/entities/InventoryGroup";
import { ArchiveManufacturedItemButton } from "@/features/ArchiveManufacturedItem";
import { CreateManufacturedItemButton } from "@/features/CreateManufacturedItem";
import { EditManufacturedItemButton } from "@/features/EditManufacturedItem";
import { ExportExcelButton } from "@/features/ExportExcel";
import { ProduceManufacturedItemButton } from "@/features/ProduceManufacturedItem";
import { ManufacturedInventoryHistoryButton } from "@/features/ViewManufacturedInventoryHistory";
import { getErrorMessage } from "@/shared/api";

import styles from "./ManufacturedItemsTableWidget.module.scss";

const sortOptions: Array<{
  value: ManufacturedItemSortField;
  content: string;
}> = [
  { value: "name", content: "По названию" },
  { value: "free_quantity", content: "По остатку" },
  { value: "created_at", content: "По дате создания" },
];

const availabilityOptions: Array<{
  value: AvailabilityFilter;
  content: string;
}> = [
  { value: "all", content: "Любое наличие" },
  { value: "in_stock", content: "Есть в наличии" },
  { value: "out_of_stock", content: "Нет в наличии" },
];

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

interface ManufacturedItemsSectionProps {
  kind: Exclude<ManufacturedItemKind, "all">;
  title: string;
  prefix: "semi" | "product";
}

export function ManufacturedItemsSection({
  kind,
  title,
  prefix,
}: ManufacturedItemsSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageKey = `${prefix}_page`;
  const pageSizeKey = `${prefix}_page_size`;
  const searchKey = `${prefix}_search`;
  const sortByKey = `${prefix}_sort_by`;
  const sortOrderKey = `${prefix}_sort_order`;
  const availabilityKey = `${prefix}_availability`;
  const productKey = `${prefix}_product_id`;
  const groupKey = `${prefix}_group_id`;
  const page = positiveInteger(searchParams.get(pageKey), 1);
  const pageSize = positiveInteger(searchParams.get(pageSizeKey), 20);
  const search = searchParams.get(searchKey) ?? "";
  const sortBy = (searchParams.get(sortByKey) ??
    "name") as ManufacturedItemSortField;
  const sortOrder = (searchParams.get(sortOrderKey) ?? "asc") as SortOrder;
  const availability = (searchParams.get(availabilityKey) ??
    "all") as AvailabilityFilter;
  const productId = searchParams.get(productKey) ?? "";
  const groupId = searchParams.get(groupKey) ?? "";
  const isProduct = kind === "product";
  const productsQuery = useProductOptionsQuery(!isProduct);
  const groupsQuery = useInventoryGroupsQuery();
  const params: ManufacturedItemListParams = {
    page,
    page_size: pageSize,
    search: search || null,
    sort_by: sortBy,
    sort_order: sortOrder,
    availability,
    kind,
    product_id: !isProduct && productId ? productId : null,
    group_id: !isProduct && groupId ? groupId : null,
  };
  const query = useManufacturedItemsQuery(params);
  const updateUrl = (updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  };
  const renderActions = (item: ManufacturedItem) => (
    <div className={styles.actions}>
      <ProduceManufacturedItemButton itemId={item.id} itemName={item.name} />
      <ManufacturedInventoryHistoryButton item={item} />
      <EditManufacturedItemButton item={item} />
      <ArchiveManufacturedItemButton item={item} />
    </div>
  );
  const hasFilters =
    Boolean(search) ||
    availability !== "all" ||
    (!isProduct && Boolean(productId || groupId));

  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            {title}
          </Text>
        </div>
        <div className={styles.actions}>
          <ExportExcelButton
            dataset="manufactured_items"
            params={{
              ...(search ? { search } : {}),
              sort_by: sortBy,
              sort_order: sortOrder,
              availability,
              kind,
            }}
          />
          <CreateManufacturedItemButton
            defaultIsProduct={isProduct}
            buttonLabel={isProduct ? "Создать продукт" : "Создать полуфабрикат"}
          />
        </div>
      </div>

      <div className={styles.filters}>
        <TextInput
          type="search"
          value={search}
          onUpdate={(value) => updateUrl({ [searchKey]: value, [pageKey]: 1 })}
          placeholder={`Поиск: ${title.toLowerCase()}`}
          hasClear
          size="l"
          controlProps={{ "aria-label": `Поиск: ${title.toLowerCase()}` }}
        />
        {!isProduct ? (
          <Select
            options={(productsQuery.data ?? []).map((product) => ({
              value: product.id,
              content: product.name,
            }))}
            value={productId ? [productId] : []}
            onUpdate={(values) =>
              updateUrl({ [productKey]: values[0] ?? "", [pageKey]: 1 })
            }
            placeholder="Для любого продукта"
            hasClear
            filterable
            width="max"
            size="l"
            aria-label="Фильтр полуфабрикатов по продукту"
          />
        ) : null}
        {!isProduct ? (
          <Select
            options={(groupsQuery.data ?? []).map((group) => ({
              value: group.id,
              content: group.name,
            }))}
            value={groupId ? [groupId] : []}
            onUpdate={(values) =>
              updateUrl({ [groupKey]: values[0] ?? "", [pageKey]: 1 })
            }
            placeholder="Любая группа"
            hasClear
            filterable
            width="max"
            size="l"
            aria-label="Фильтр полуфабрикатов по группе"
          />
        ) : null}
        <Select
          options={availabilityOptions}
          value={[availability]}
          onUpdate={(values) =>
            updateUrl({ [availabilityKey]: values[0] ?? "all", [pageKey]: 1 })
          }
          width="max"
          size="l"
          aria-label={`Наличие: ${title.toLowerCase()}`}
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) =>
            updateUrl({ [sortByKey]: values[0] ?? "name", [pageKey]: 1 })
          }
          width="max"
          size="l"
          aria-label={`Сортировка: ${title.toLowerCase()}`}
        />
        <Button
          view="outlined"
          size="l"
          onClick={() =>
            updateUrl({
              [sortOrderKey]: sortOrder === "asc" ? "desc" : "asc",
              [pageKey]: 1,
            })
          }
        >
          {sortOrder === "asc" ? "По возрастанию" : "По убыванию"}
        </Button>
      </div>

      {query.isPending ? (
        <div
          className={styles.loading}
          aria-label={`Загрузка: ${title.toLowerCase()}`}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title={`Не удалось загрузить: ${title.toLowerCase()}`}
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Boxes3 width={100} height={100} />}
          title={
            hasFilters ? "Ничего не найдено" : `${title} пока не добавлены`
          }
          description={
            hasFilters
              ? "Измените поисковый запрос или фильтр наличия."
              : `Создайте ${isProduct ? "первый продукт" : "первый полуфабрикат"}.`
          }
          actions={
            !hasFilters ? (
              <CreateManufacturedItemButton
                defaultIsProduct={isProduct}
                buttonLabel={
                  isProduct ? "Создать продукт" : "Создать полуфабрикат"
                }
              />
            ) : null
          }
        />
      ) : (
        <div className={styles.content}>
          <ManufacturedItemsTable
            items={query.data.items}
            renderActions={renderActions}
          />
          <div className={styles.pagination}>
            <Text color="secondary">Всего: {query.data.total}</Text>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={query.data.total}
              pageSizeOptions={[10, 20, 50, 100]}
              onUpdate={(nextPage, nextPageSize) =>
                updateUrl({
                  [pageKey]: nextPage,
                  [pageSizeKey]: nextPageSize,
                })
              }
              showInput
            />
          </div>
        </div>
      )}
    </Card>
  );
}

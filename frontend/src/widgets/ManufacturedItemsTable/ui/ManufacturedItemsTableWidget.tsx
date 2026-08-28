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
  type AvailabilityFilter,
  type ManufacturedItem,
  type ManufacturedItemKind,
  type ManufacturedItemListParams,
  type ManufacturedItemSortField,
  type SortOrder,
} from "@/entities/ManufacturedItem";
import { AdjustManufacturedStockButton } from "@/features/AdjustManufacturedStock";
import { ArchiveManufacturedItemButton } from "@/features/ArchiveManufacturedItem";
import { CreateManufacturedItemButton } from "@/features/CreateManufacturedItem";
import { EditManufacturedItemButton } from "@/features/EditManufacturedItem";
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

const kindOptions: Array<{ value: ManufacturedItemKind; content: string }> = [
  { value: "all", content: "Все типы" },
  { value: "semi_finished", content: "Полуфабрикаты" },
  { value: "product", content: "Продукты" },
];

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function ManufacturedItemsTableWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get("items_page"), 1);
  const pageSize = positiveInteger(searchParams.get("items_page_size"), 20);
  const search = searchParams.get("items_search") ?? "";
  const sortBy = (searchParams.get("items_sort_by") ??
    "name") as ManufacturedItemSortField;
  const sortOrder = (searchParams.get("items_sort_order") ??
    "asc") as SortOrder;
  const availability = (searchParams.get("items_availability") ??
    "all") as AvailabilityFilter;
  const kind = (searchParams.get("items_kind") ??
    "all") as ManufacturedItemKind;

  const params: ManufacturedItemListParams = {
    page,
    page_size: pageSize,
    search: search || null,
    sort_by: sortBy,
    sort_order: sortOrder,
    availability,
    kind,
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
      <AdjustManufacturedStockButton item={item} />
      <ManufacturedInventoryHistoryButton item={item} />
      <EditManufacturedItemButton item={item} />
      <ArchiveManufacturedItemButton item={item} />
    </div>
  );

  const hasFilters =
    Boolean(search) || kind !== "all" || availability !== "all";

  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            Полуфабрикаты и продукты
          </Text>
        </div>
        <CreateManufacturedItemButton />
      </div>

      <div className={styles.filters}>
        <TextInput
          type="search"
          value={search}
          onUpdate={(value) =>
            updateUrl({ items_search: value, items_page: 1 })
          }
          placeholder="Поиск по названию"
          hasClear
          size="l"
          controlProps={{ "aria-label": "Поиск производимых позиций" }}
        />
        <Select
          options={kindOptions}
          value={[kind]}
          onUpdate={(values) =>
            updateUrl({ items_kind: values[0] ?? "all", items_page: 1 })
          }
          width="max"
          size="l"
          aria-label="Фильтр по типу позиции"
        />
        <Select
          options={availabilityOptions}
          value={[availability]}
          onUpdate={(values) =>
            updateUrl({ items_availability: values[0] ?? "all", items_page: 1 })
          }
          width="max"
          size="l"
          aria-label="Фильтр позиций по наличию"
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) =>
            updateUrl({ items_sort_by: values[0] ?? "name", items_page: 1 })
          }
          width="max"
          size="l"
          aria-label="Сортировка производимых позиций"
        />
        <Button
          view="outlined"
          size="l"
          onClick={() =>
            updateUrl({
              items_sort_order: sortOrder === "asc" ? "desc" : "asc",
              items_page: 1,
            })
          }
        >
          {sortOrder === "asc" ? "По возрастанию" : "По убыванию"}
        </Button>
      </div>

      {query.isPending ? (
        <div
          className={styles.loading}
          aria-label="Загрузка производимых позиций"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить производимые позиции"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Boxes3 />}
          title={
            hasFilters ? "Ничего не найдено" : "Производимых позиций пока нет"
          }
          description={
            hasFilters
              ? "Измените поисковый запрос или фильтры."
              : "Создайте первый полуфабрикат или готовый продукт."
          }
          actions={!hasFilters ? <CreateManufacturedItemButton /> : null}
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
                  items_page: nextPage,
                  items_page_size: nextPageSize,
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

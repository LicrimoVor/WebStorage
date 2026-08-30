import { Wrench } from "@gravity-ui/icons";
import {
  Alert,
  Button,
  Card,
  Pagination,
  PlaceholderContainer,
  Select,
  Skeleton,
  Switch,
  Text,
  TextInput,
} from "@gravity-ui/uikit";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  OperationsTable,
  useOperationsQuery,
  type Operation,
  type OperationListParams,
  type OperationSortField,
  type SortOrder,
} from "@/entities/Operation";
import { ArchiveOperationButton } from "@/features/ArchiveOperation";
import { CreateOperationButton } from "@/features/CreateOperation";
import { EditOperationButton } from "@/features/EditOperation";
import { ExportExcelButton } from "@/features/ExportExcel";
import { RecordWorkButton } from "@/features/RecordWork";
import { WorkHistoryButton } from "@/features/ViewWorkHistory";
import { getErrorMessage } from "@/shared/api";
import { routes } from "@/shared/routes";

import styles from "./OperationsTableWidget.module.scss";

const sortOptions: Array<{ value: OperationSortField; content: string }> = [
  { value: "name", content: "По названию" },
  { value: "time_norm", content: "По норме времени" },
  { value: "price_per_operation", content: "По ставке" },
  { value: "created_at", content: "По дате создания" },
];

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function OperationsTableWidget() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = positiveInteger(searchParams.get("page_size"), 20);
  const search = searchParams.get("search") ?? "";
  const sortBy = (searchParams.get("sort_by") ?? "name") as OperationSortField;
  const sortOrder = (searchParams.get("sort_order") ?? "asc") as SortOrder;
  const includeArchived = searchParams.get("include_archived") === "true";
  const params: OperationListParams = {
    page,
    page_size: pageSize,
    search: search || null,
    sort_by: sortBy,
    sort_order: sortOrder,
    include_archived: includeArchived,
  };
  const query = useOperationsQuery(params);
  const updateUrl = (
    updates: Record<string, string | number | boolean | undefined>,
  ) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === false)
        next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  };
  const renderActions = (operation: Operation) => (
    <div className={styles.actions}>
      <Button
        view="flat-action"
        size="s"
        onClick={() => navigate(routes.operationInstruction(operation.id))}
      >
        Инструкция
      </Button>
      <RecordWorkButton operation={operation} />
      <WorkHistoryButton operation={operation} />
      <EditOperationButton operation={operation} />
      {!operation.archived ? (
        <ArchiveOperationButton operation={operation} />
      ) : null}
    </div>
  );
  const hasFilters = Boolean(search) || includeArchived;
  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            Справочник операций
          </Text>
        </div>
        <div className={styles.actions}>
          <ExportExcelButton
            dataset="operations"
            params={{
              ...(search ? { search } : {}),
              include_archived: includeArchived,
              sort_by: sortBy,
              sort_order: sortOrder,
            }}
          />
          <CreateOperationButton />
        </div>
      </div>
      <div className={styles.filters}>
        <TextInput
          type="search"
          value={search}
          onUpdate={(value) => updateUrl({ search: value, page: 1 })}
          placeholder="Поиск по названию"
          hasClear
          size="l"
          controlProps={{ "aria-label": "Поиск операций" }}
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) =>
            updateUrl({ sort_by: values[0] ?? "name", page: 1 })
          }
          width="max"
          size="l"
          aria-label="Сортировка операций"
        />
        <Button
          view="outlined"
          size="l"
          onClick={() =>
            updateUrl({
              sort_order: sortOrder === "asc" ? "desc" : "asc",
              page: 1,
            })
          }
        >
          {sortOrder === "asc" ? "По возрастанию" : "По убыванию"}
        </Button>
        <Switch
          size="l"
          checked={includeArchived}
          onUpdate={(checked) =>
            updateUrl({ include_archived: checked, page: 1 })
          }
        >
          Показывать архивные
        </Switch>
      </div>
      {query.isPending ? (
        <div className={styles.loading} aria-label="Загрузка операций">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить операции"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Wrench width={100} height={100} />}
          title={hasFilters ? "Ничего не найдено" : "Операций пока нет"}
          description={
            hasFilters
              ? "Измените поиск или фильтры."
              : "Создайте первую производственную операцию."
          }
          actions={!hasFilters ? <CreateOperationButton /> : null}
        />
      ) : (
        <div className={styles.content}>
          <OperationsTable
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
                updateUrl({ page: nextPage, page_size: nextPageSize })
              }
              showInput
            />
          </div>
        </div>
      )}
    </Card>
  );
}

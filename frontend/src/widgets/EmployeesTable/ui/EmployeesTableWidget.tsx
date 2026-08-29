import { Persons } from "@gravity-ui/icons";
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
import { useSearchParams } from "react-router-dom";

import {
  EmployeesTable,
  useEmployeesQuery,
  type Employee,
  type EmployeeListParams,
  type EmployeeSortField,
  type SortOrder,
} from "@/entities/Employee";
import { ArchiveEmployeeButton } from "@/features/ArchiveEmployee";
import { CreateEmployeeButton } from "@/features/CreateEmployee";
import { EditEmployeeButton } from "@/features/EditEmployee";
import { ExportExcelButton } from "@/features/ExportExcel";
import { PayrollDetailsButton, RegisterPaymentButton } from "@/features/ManagePayroll";
import { WorkHistoryButton } from "@/features/ViewWorkHistory";
import { getErrorMessage } from "@/shared/api";

import styles from "./EmployeesTableWidget.module.scss";

const sortOptions: Array<{ value: EmployeeSortField; content: string }> = [
  { value: "full_name", content: "По ФИО" },
  { value: "created_at", content: "По дате добавления" },
];

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function EmployeesTableWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = positiveInteger(searchParams.get("page_size"), 20);
  const search = searchParams.get("search") ?? "";
  const sortBy = (searchParams.get("sort_by") ??
    "full_name") as EmployeeSortField;
  const sortOrder = (searchParams.get("sort_order") ?? "asc") as SortOrder;
  const includeInactive = searchParams.get("include_inactive") === "true";
  const params: EmployeeListParams = {
    page,
    page_size: pageSize,
    search: search || null,
    sort_by: sortBy,
    sort_order: sortOrder,
    include_inactive: includeInactive,
  };
  const query = useEmployeesQuery(params);
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
  const renderActions = (employee: Employee) => (
    <div className={styles.actions}>
      <RegisterPaymentButton employee={employee} />
      <PayrollDetailsButton employee={employee} />
      <WorkHistoryButton employee={employee} />
      <EditEmployeeButton employee={employee} />
      <ArchiveEmployeeButton employee={employee} />
    </div>
  );
  const hasFilters = Boolean(search) || includeInactive;
  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            Сотрудники
          </Text>
        </div>
        <div className={styles.actions}>
          <ExportExcelButton
            dataset="employees"
            params={{
              ...(search ? { search } : {}),
              include_archived: includeInactive,
              sort_by: sortBy,
              sort_order: sortOrder,
            }}
          />
          <CreateEmployeeButton />
        </div>
      </div>
      <div className={styles.filters}>
        <TextInput
          type="search"
          value={search}
          onUpdate={(value) => updateUrl({ search: value, page: 1 })}
          placeholder="Поиск по ФИО"
          hasClear
          size="l"
          controlProps={{ "aria-label": "Поиск сотрудников" }}
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) =>
            updateUrl({ sort_by: values[0] ?? "full_name", page: 1 })
          }
          width="max"
          size="l"
          aria-label="Сортировка сотрудников"
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
          checked={includeInactive}
          onUpdate={(checked) =>
            updateUrl({ include_inactive: checked, page: 1 })
          }
        >
          Показывать неактивных
        </Switch>
      </div>
      {query.isPending ? (
        <div className={styles.loading} aria-label="Загрузка сотрудников">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить сотрудников"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Persons />}
          title={hasFilters ? "Ничего не найдено" : "Сотрудников пока нет"}
          description={
            hasFilters
              ? "Измените поиск или фильтры."
              : "Добавьте первого сотрудника производственного участка."
          }
          actions={!hasFilters ? <CreateEmployeeButton /> : null}
        />
      ) : (
        <div className={styles.content}>
          <EmployeesTable
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

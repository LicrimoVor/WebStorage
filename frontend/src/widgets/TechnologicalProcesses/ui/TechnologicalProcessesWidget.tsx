import { Wrench } from "@gravity-ui/icons";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Label,
  Pagination,
  PlaceholderContainer,
  Select,
  Skeleton,
  Switch,
  Table,
  Text,
  TextArea,
  TextInput,
  type TableColumnConfig,
} from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useManufacturedItemsQuery } from "@/entities/ManufacturedItem";
import {
  archiveTechnologicalProcess,
  createTechnologicalProcess,
  importTechnologicalProcess,
  technologicalProcessKeys,
  useTechnologicalProcessesQuery,
  type ProcessGraphInput,
  type ProcessSortField,
  type ProcessStatus,
  type TechnologicalProcess,
  type TechnologicalProcessListParams,
} from "@/entities/TechnologicalProcess";
import { getErrorMessage } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { routes } from "@/shared/routes";

import styles from "./TechnologicalProcessesWidget.module.scss";

const statusView: Record<
  ProcessStatus,
  { text: string; theme: "info" | "success" | "normal" }
> = {
  draft: { text: "Черновик", theme: "info" },
  active: { text: "Активен", theme: "success" },
  archived: { text: "Архив", theme: "normal" },
};

const sortOptions: Array<{ value: ProcessSortField; content: string }> = [
  { value: "updated_at", content: "По изменению" },
  { value: "name", content: "По названию" },
  { value: "created_at", content: "По созданию" },
];

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function StatusLabel({ status }: { status: ProcessStatus }) {
  const view = statusView[status];
  return <Label theme={view.theme}>{view.text}</Label>;
}

function CreateProcessButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [outputItemId, setOutputItemId] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const itemsQuery = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
  });
  const mutation = useMutation({
    mutationFn: () =>
      createTechnologicalProcess({
        name: name.trim(),
        output_item_id: outputItemId,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.all,
      });
      setOpen(false);
      setName("");
      setOutputItemId("");
      navigate(routes.processEditor(result.process.id));
    },
  });
  const options =
    itemsQuery.data?.items.map((item) => ({
      value: item.id,
      content: `${item.name} · ${item.is_product ? "изделие" : "полуфабрикат"}`,
    })) ?? [];
  const close = () => {
    if (!mutation.isPending) {
      setOpen(false);
      mutation.reset();
    }
  };
  return (
    <>
      <Button view="action" size="l" onClick={() => setOpen(true)}>
        Создать техпроцесс
      </Button>
      <Dialog open={open} onClose={close} maxWidth="m" fullWidth>
        <Dialog.Header caption="Новый технологический процесс" />
        <Dialog.Body>
          <div className={styles.form}>
            <TextInput
              value={name}
              onUpdate={setName}
              label="Название"
              size="l"
              controlProps={{ "aria-label": "Название техпроцесса" }}
            />
            <Select
              options={options}
              value={outputItemId ? [outputItemId] : []}
              onUpdate={(values) => setOutputItemId(values[0] ?? "")}
              placeholder={
                itemsQuery.isPending ? "Загрузка…" : "Выберите результат"
              }
              label="Результат"
              size="l"
              width="max"
              aria-label="Результат техпроцесса"
            />
            {mutation.error ? (
              <Alert theme="danger" message={getErrorMessage(mutation.error)} />
            ) : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Создать"
          textButtonCancel="Отмена"
          onClickButtonApply={() => mutation.mutate()}
          onClickButtonCancel={close}
          loading={mutation.isPending}
          propsButtonApply={{ disabled: !name.trim() || !outputItemId }}
        />
      </Dialog>
    </>
  );
}

function ImportProcessButton() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [parseError, setParseError] = useState<string>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (document: ProcessGraphInput) =>
      importTechnologicalProcess(document),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.all,
      });
      setOpen(false);
      setSource("");
      navigate(routes.processEditor(result.process.id));
    },
  });
  const submit = () => {
    try {
      const parsed = JSON.parse(source) as ProcessGraphInput;
      setParseError(undefined);
      mutation.mutate(parsed);
    } catch {
      setParseError("JSON содержит синтаксическую ошибку");
    }
  };
  return (
    <>
      <Button view="outlined" size="l" onClick={() => setOpen(true)}>
        Импорт JSON
      </Button>
      <Dialog
        open={open}
        onClose={() => !mutation.isPending && setOpen(false)}
        maxWidth="l"
        fullWidth
      >
        <Dialog.Header caption="Импорт черновика из JSON" />
        <Dialog.Body>
          <TextArea
            value={source}
            onUpdate={setSource}
            rows={16}
            placeholder='{"schemaVersion":1,"name":"...","nodes":[],"edges":[]}'
            controlProps={{ "aria-label": "JSON технологического процесса" }}
            {...(parseError
              ? {
                  validationState: "invalid" as const,
                  errorMessage: parseError,
                }
              : {})}
          />
          {mutation.error ? (
            <Alert
              className={styles.dialogAlert}
              theme="danger"
              message={getErrorMessage(mutation.error)}
            />
          ) : null}
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Импортировать"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={() => setOpen(false)}
          loading={mutation.isPending}
          propsButtonApply={{ disabled: !source.trim() }}
        />
      </Dialog>
    </>
  );
}

function ArchiveProcessButton({ process }: { process: TechnologicalProcess }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => archiveTechnologicalProcess(process.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.all,
      });
      setOpen(false);
    },
  });
  return (
    <>
      <Button view="flat-danger" size="s" onClick={() => setOpen(true)}>
        В архив
      </Button>
      <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)}>
        <Dialog.Header caption="Архивировать технологический процесс?" />
        <Dialog.Body>
          Активная версия «{process.name}» будет отключена, история сохранится.
        </Dialog.Body>
        <Dialog.Footer
          preset="danger"
          textButtonApply="Архивировать"
          textButtonCancel="Отмена"
          onClickButtonApply={() => mutation.mutate()}
          onClickButtonCancel={() => setOpen(false)}
          loading={mutation.isPending}
          errorText={mutation.error ? getErrorMessage(mutation.error) : ""}
          showError={Boolean(mutation.error)}
        />
      </Dialog>
    </>
  );
}

function ProcessesTable({
  items,
  renderActions,
}: {
  items: TechnologicalProcess[];
  renderActions: (process: TechnologicalProcess) => ReactNode;
}) {
  const columns: TableColumnConfig<TechnologicalProcess>[] = [
    {
      id: "name",
      name: "Название",
      primary: true,
      template: (item) => item.name,
    },
    {
      id: "output",
      name: "Результат",
      template: (item) => item.output_item_name ?? "Не сопоставлен",
    },
    {
      id: "version",
      name: "Версия",
      template: (item) => `v${item.latest_version.version_number}`,
    },
    {
      id: "status",
      name: "Статус",
      template: (item) => <StatusLabel status={item.latest_version.status} />,
    },
    {
      id: "updated",
      name: "Изменён",
      template: (item) => formatDateTime(item.updated_at),
    },
    {
      id: "author",
      name: "Автор",
      template: (item) => item.latest_version.created_by,
    },
    { id: "actions", name: "Действия", sticky: "end", template: renderActions },
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

export function TechnologicalProcessesWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = positiveInteger(searchParams.get("page_size"), 20);
  const search = searchParams.get("search") ?? "";
  const includeArchived = searchParams.get("include_archived") === "true";
  const sortBy = (searchParams.get("sort_by") ??
    "updated_at") as ProcessSortField;
  const sortOrder = searchParams.get("sort_order") === "asc" ? "asc" : "desc";
  const params: TechnologicalProcessListParams = {
    page,
    page_size: pageSize,
    search: search || null,
    include_archived: includeArchived,
    sort_by: sortBy,
    sort_order: sortOrder,
  };
  const query = useTechnologicalProcessesQuery(params);
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
  const actions = (process: TechnologicalProcess) => (
    <div className={styles.actions}>
      <Button
        view="flat-action"
        size="s"
        onClick={() => navigate(routes.processEditor(process.id))}
      >
        Открыть
      </Button>
      {!process.archived ? <ArchiveProcessButton process={process} /> : null}
    </div>
  );
  const hasFilters = Boolean(search) || includeArchived;
  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            Технологические процессы
          </Text>
        </div>
        <div className={styles.headingActions}>
          <ImportProcessButton />
          <CreateProcessButton />
        </div>
      </div>
      <div className={styles.filters}>
        <TextInput
          type="search"
          value={search}
          onUpdate={(value) => updateUrl({ search: value, page: 1 })}
          placeholder="Название или результат"
          hasClear
          size="l"
          controlProps={{ "aria-label": "Поиск техпроцессов" }}
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) =>
            updateUrl({ sort_by: values[0] ?? "updated_at", page: 1 })
          }
          width="max"
          size="l"
          aria-label="Сортировка техпроцессов"
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
        <div className={styles.loading} aria-label="Загрузка техпроцессов">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить техпроцессы"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Wrench width={100} height={100} />}
          title={hasFilters ? "Ничего не найдено" : "Техпроцессов пока нет"}
          description={
            hasFilters
              ? "Измените поиск или фильтры."
              : "Создайте процесс для производимой позиции или импортируйте JSON."
          }
          actions={!hasFilters ? <CreateProcessButton /> : null}
        />
      ) : (
        <div className={styles.content}>
          <ProcessesTable items={query.data.items} renderActions={actions} />
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

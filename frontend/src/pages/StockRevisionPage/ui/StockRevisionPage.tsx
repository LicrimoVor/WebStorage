import { ArrowLeft, Picture } from "@gravity-ui/icons";
import {
  Alert,
  Box,
  Button,
  Card,
  Icon,
  Label,
  Select,
  Skeleton,
  Table,
  Text,
  TextInput,
  type TableColumnConfig,
} from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useInventoryGroupsQuery } from "@/entities/InventoryGroup";
import {
  manufacturedItemKeys,
  useProductOptionsQuery,
} from "@/entities/ManufacturedItem";
import { materialKeys } from "@/entities/Material";
import {
  createStockRevision,
  stockRevisionKeys,
  useStockRevisionRowsQuery,
  type StockRevisionCreate,
  type StockRevisionEntityType,
  type StockRevisionRow,
} from "@/entities/StockRevision";
import { ManageInventoryGroupsButton } from "@/features/ManageInventoryGroups";
import { getErrorMessage } from "@/shared/api";
import { formatDecimal, isDecimal, normalizeDecimal } from "@/shared/lib";
import { routes } from "@/shared/routes";

import {
  deleteRevisionDraft,
  loadRevisionDraft,
  saveRevisionDraft,
} from "../model/revisionDraft";
import styles from "./StockRevisionPage.module.scss";

const typeOptions: Array<{ value: StockRevisionEntityType; content: string }> =
  [
    { value: "material", content: "Материалы" },
    { value: "semi_finished", content: "Полуфабрикаты" },
    { value: "product", content: "Продукты" },
  ];

const typeLabels: Record<StockRevisionEntityType, string> = {
  material: "Материал",
  semi_finished: "Полуфабрикат",
  product: "Продукт",
};

function rowKey(row: Pick<StockRevisionRow, "type" | "id">) {
  return `${row.type}:${row.id}`;
}

function RevisionImage({ row }: { row: StockRevisionRow }) {
  if (row.image) {
    return (
      <img
        className={styles.image}
        src={row.image}
        alt={row.name}
        loading="lazy"
      />
    );
  }
  return (
    <Box className={styles.imagePlaceholder} aria-label="Нет изображения">
      <Icon data={Picture} size={20} />
    </Box>
  );
}

export function StockRevisionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const skipDraftWrite = useRef(false);
  const queryClient = useQueryClient();
  const search = searchParams.get("search") ?? "";
  const type =
    (searchParams.get("type") as StockRevisionEntityType | null) ?? "";
  const productId = searchParams.get("product_id") ?? "";
  const groupId = searchParams.get("group_id") ?? "";
  const rowsQuery = useStockRevisionRowsQuery({
    search: search || null,
    type: type || null,
    product_id: productId || null,
    group_id: groupId || null,
  });
  const productsQuery = useProductOptionsQuery();
  const groupsQuery = useInventoryGroupsQuery();

  useEffect(() => {
    void loadRevisionDraft()
      .then((draft) => {
        if (draft) setValues(draft.values);
        if (draft?.comment) setComment(draft.comment);
        setDraftReady(true);
      })
      .catch(() => {
        setDraftError(true);
        setDraftReady(true);
      });
  }, []);

  useEffect(() => {
    if (!draftReady) return undefined;
    if (skipDraftWrite.current) {
      skipDraftWrite.current = false;
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      void saveRevisionDraft(values, comment).catch(() => setDraftError(true));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [comment, draftReady, values]);

  const updateUrl = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next, { replace: true });
  };

  const completedEntries = useMemo(
    () => Object.entries(values).filter(([, value]) => value.trim() !== ""),
    [values],
  );
  const invalidEntry = completedEntries.find(
    ([, value]) => !isDecimal(value) || Number(normalizeDecimal(value)) < 0,
  );

  const mutation = useMutation({
    mutationFn: (payload: StockRevisionCreate) => createStockRevision(payload),
    onSuccess: async () => {
      await deleteRevisionDraft();
      skipDraftWrite.current = true;
      setValues({});
      setComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: stockRevisionKeys.all }),
        queryClient.invalidateQueries({ queryKey: materialKeys.all }),
        queryClient.invalidateQueries({ queryKey: manufacturedItemKeys.all }),
      ]);
    },
  });

  const submit = () => {
    if (completedEntries.length === 0 || invalidEntry) return;
    mutation.mutate({
      comment: comment.trim() || null,
      entries: completedEntries.map(([key, countedQuantity]) => {
        const [entryType, id] = key.split(":") as [
          StockRevisionEntityType,
          string,
        ];
        return {
          id,
          type: entryType,
          counted_quantity: normalizeDecimal(countedQuantity),
        };
      }),
    });
  };

  const columns: TableColumnConfig<StockRevisionRow>[] = [
    {
      id: "image",
      name: "Картинка",
      width: 84,
      template: (row) => <RevisionImage row={row} />,
    },
    {
      id: "name",
      name: "Название",
      primary: true,
      template: (row) => <Text variant="body-2">{row.name}</Text>,
    },
    {
      id: "type",
      name: "Тип",
      template: (row) => <Label>{typeLabels[row.type]}</Label>,
    },
    {
      id: "products",
      name: "Участвует в продуктах",
      template: (row) =>
        row.products?.map((item) => item.name).join(", ") || "—",
    },
    {
      id: "groups",
      name: "Группы",
      template: (row) => row.groups?.map((item) => item.name).join(", ") || "—",
    },
    {
      id: "current_quantity",
      name: "Текущее количество",
      align: "end",
      template: (row) => `${formatDecimal(row.current_quantity)} ${row.unit}`,
    },
    {
      id: "counted_quantity",
      name: "Фактическое количество",
      width: 210,
      sticky: "end",
      template: (row) => {
        const key = rowKey(row);
        const value = values[key] ?? "";
        const invalid =
          value !== "" &&
          (!isDecimal(value) || Number(normalizeDecimal(value)) < 0);
        return (
          <TextInput
            value={value}
            onUpdate={(next) =>
              setValues((current) => ({ ...current, [key]: next }))
            }
            placeholder={formatDecimal(row.current_quantity)}
            {...(invalid
              ? {
                  validationState: "invalid" as const,
                  errorMessage: "Введите число от 0",
                }
              : {})}
            controlProps={{
              inputMode: "decimal",
              "aria-label": `Фактическое количество: ${row.name}`,
            }}
            size="m"
          />
        );
      },
    },
  ];

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Button view="flat" onClick={() => navigate(routes.warehouse)}>
            <Icon data={ArrowLeft} /> Назад на склад
          </Button>
          <Text as="h1" variant="display-1">
            Ревизия
          </Text>
        </div>
        <ManageInventoryGroupsButton />
      </header>

      <Card view="outlined" className={styles.card}>
        <div className={styles.filters}>
          <TextInput
            type="search"
            value={search}
            onUpdate={(value) => updateUrl({ search: value })}
            placeholder="Поиск по названию"
            hasClear
            size="l"
          />
          <Select
            options={typeOptions}
            value={type ? [type] : []}
            onUpdate={(next) => updateUrl({ type: next[0] ?? "" })}
            placeholder="Все типы"
            hasClear
            width="max"
            size="l"
          />
          <Select
            options={(productsQuery.data ?? []).map((item) => ({
              value: item.id,
              content: item.name,
            }))}
            value={productId ? [productId] : []}
            onUpdate={(next) => updateUrl({ product_id: next[0] ?? "" })}
            placeholder="Любой продукт"
            filterable
            hasClear
            width="max"
            size="l"
          />
          <Select
            options={(groupsQuery.data ?? []).map((item) => ({
              value: item.id,
              content: item.name,
            }))}
            value={groupId ? [groupId] : []}
            onUpdate={(next) => updateUrl({ group_id: next[0] ?? "" })}
            placeholder="Любая группа"
            filterable
            hasClear
            width="max"
            size="l"
          />
        </div>

        {draftError ? (
          <Alert
            theme="warning"
            message="Не удалось сохранить локальный черновик в IndexedDB."
          />
        ) : null}
        {rowsQuery.isPending ? (
          <div className={styles.loading}>
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className={styles.skeleton} />
            ))}
          </div>
        ) : rowsQuery.isError ? (
          <Alert
            theme="danger"
            title="Не удалось загрузить позиции"
            message={getErrorMessage(rowsQuery.error)}
          />
        ) : rowsQuery.data.length === 0 ? (
          <Alert theme="info" message="По выбранным фильтрам позиций нет." />
        ) : (
          <div className={styles.tableWrap}>
            <Table
              data={rowsQuery.data}
              className={styles.table}
              columns={columns}
              getRowId={rowKey}
              verticalAlign="middle"
            />
          </div>
        )}

        <div className={styles.footer}>
          <TextInput
            value={comment}
            onUpdate={setComment}
            label="Комментарий к ревизии"
            size="l"
          />
          <div className={styles.saveBlock}>
            <Text color="secondary">
              Заполнено позиций: {completedEntries.length}
            </Text>
            <Button
              view="action"
              size="l"
              loading={mutation.isPending}
              disabled={completedEntries.length === 0 || Boolean(invalidEntry)}
              onClick={submit}
            >
              Провести ревизию
            </Button>
          </div>
        </div>
        {mutation.isError ? (
          <Alert theme="danger" message={getErrorMessage(mutation.error)} />
        ) : null}
        {mutation.isSuccess ? (
          <Alert
            theme="success"
            message="Ревизия проведена, локальный черновик удалён."
          />
        ) : null}
      </Card>
    </main>
  );
}

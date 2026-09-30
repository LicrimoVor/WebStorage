import {ReleaseProductsButton} from '@/features/ProduceManufacturedItem/ui/ReleaseProductsButton';
import {Select, TextInput} from '@/shared/ui/FormControls';
import {Alert, Button, Card, Pagination, PlaceholderContainer, Skeleton, Switch, Text} from '@gravity-ui/uikit';
import { Boxes3 } from "@gravity-ui/icons";
import { useSearchParams } from "react-router-dom";
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ManufacturedDetails} from '@/widgets/ManufacturedItemsTable/ui/ManufacturedDetails';
import {CreateManufacturedItemButton} from '@/features/CreateManufacturedItem';
import type {components} from '@/shared/api/generated/schema';
import {MaterialDetails} from './MaterialDetails';
import {DefectTransferButton} from './DefectTransferButton';

import {
  MaterialsTable,
  type AvailabilityFilter,
  type Material,
  type MaterialListParams,
  type MaterialSortField,
  type SortOrder,
} from "@/entities/Material";
import { AdjustStockButton } from "@/features/AdjustStock";
import { ArchiveMaterialButton } from "@/features/ArchiveMaterial";
import { CreateMaterialButton } from "@/features/CreateMaterial";
import { EditMaterialButton } from "@/features/EditMaterial";
import { ExportExcelButton } from "@/features/ExportExcel";
import { InventoryHistoryButton } from "@/features/ViewInventoryHistory";
import { apiRequest, getErrorMessage } from "@/shared/api";

import styles from "./MaterialsTableWidget.module.scss";

const sortOptions: Array<{ value: MaterialSortField; content: string }> = [
  { value: "name", content: "По названию" },
  { value: "free_quantity", content: "По остатку" },
  { value: "price", content: "По цене" },
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

export function MaterialsTableWidget({kind = 'all', hideCreate = false}: {kind?: 'all' | 'semi_finished' | 'product'; hideCreate?: boolean}) {
  const [selected, setSelected] = useState<Material & {kind?: string}>();
  const title = kind === 'product' ? 'Продукты' : kind === 'semi_finished' ? 'Полуфабрикаты' : 'Материалы';
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = positiveInteger(searchParams.get("page_size"), 20);
  const search = searchParams.get("search") ?? "";
  const sortBy = (searchParams.get("sort_by") ?? "name") as MaterialSortField;
  const sortOrder = (searchParams.get("sort_order") ?? "asc") as SortOrder;
  const availability = (searchParams.get("availability") ??
    "all") as AvailabilityFilter;
  const deficitOnly = searchParams.get("deficit_only") === "true";
  const productId = searchParams.get("product_id") ?? "";
  const groupId = searchParams.get("group_id") ?? "";

  const ungrouped = searchParams.get("ungrouped") === "true";
  const params: MaterialListParams & {ungrouped: boolean} = {
    ungrouped,
    page,
    page_size: pageSize,
    search: search || null,
    sort_by: sortBy,
    sort_order: sortOrder,
    availability,
    deficit_only: deficitOnly,
    product_id: productId || null,
    group_id: groupId || null,
  };
  const query = useQuery({queryKey: ['materials', 'catalog', kind, params], queryFn: () => {
    const url = new URLSearchParams({kind});
    Object.entries(params).forEach(([key, value]) => {if (value !== null && value !== undefined && value !== '') url.set(key, String(value));});
    return apiRequest<components['schemas']['CatalogList']>(`/warehouse/catalog?${url}`);
  }});

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

  const renderActions = (material: Material) => (
    <div className={styles.actions}>
      {!material.archived && <AdjustStockButton material={material} />}
      {!material.archived && <><DefectTransferButton material={material} />{!material.source_material_id && <CreateMaterialButton sourceMaterial={material} />}</>}
      <InventoryHistoryButton material={material} />
      {!material.archived && <><EditMaterialButton material={material} />
      <ArchiveMaterialButton material={material} /></>}
    </div>
  );

  return (
    <Card className={styles.root} view="outlined">
      <div className={styles.heading}>
        <div>
          <Text as="h2" variant="header-2">
            {title}
          </Text>
        </div>
        <div className={styles.actions}>
          {kind === 'product' && <ReleaseProductsButton />}
          {kind === 'all' && <ExportExcelButton
            dataset="materials"
            label="Экспорт материалов"
            params={{
              ...(search ? { search } : {}),
              sort_by: sortBy,
              sort_order: sortOrder,
              availability,
              deficit_only: deficitOnly,
              ...(groupId ? {group_id: groupId} : {}),
              ...(productId ? {product_id: productId} : {}),
            }}
          />}
          {!hideCreate && (kind === 'all' ? <><CreateMaterialButton defaultGroupId={groupId} /><CreateManufacturedItemButton defaultGroupId={groupId} buttonLabel="Создать полуфабрикат" /></> : <CreateManufacturedItemButton defaultIsProduct={kind === 'product'} buttonLabel={kind === 'product' ? 'Создать продукт' : 'Создать полуфабрикат'} />)}
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
          controlProps={{ "aria-label": "Поиск материалов" }}
        />
        <Select
          options={availabilityOptions}
          value={[availability]}
          onUpdate={(values) =>
            updateUrl({ availability: values[0] ?? "all", page: 1 })
          }
          width="max"
          size="l"
          aria-label="Фильтр по наличию"
        />
        <Select
          options={sortOptions}
          value={[sortBy]}
          onUpdate={(values) =>
            updateUrl({ sort_by: values[0] ?? "name", page: 1 })
          }
          width="max"
          size="l"
          aria-label="Сортировка материалов"
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
          checked={deficitOnly}
          onUpdate={(checked) => updateUrl({ deficit_only: checked, page: 1 })}
        >
          Только дефицит
        </Switch>
      </div>

      {query.isPending ? (
        <div className={styles.loading} aria-label="Загрузка материалов">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить материалы"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Boxes3 width={100} height={100} />}
          title={
            search || deficitOnly || productId || groupId || ungrouped
              ? "Ничего не найдено"
              : `${title}: пока нет позиций`
          }
          description={
            search || deficitOnly || productId || groupId || ungrouped
              ? "Измените поисковый запрос или фильтры."
              : "Создайте позицию и укажите её свойства."
          }

        />
      ) : (
        <div className={styles.content}>
          <MaterialsTable
            items={query.data.items}
            onSelect={setSelected}
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
      {selected && (selected.kind && selected.kind !== 'material' ? <ManufacturedDetails row={selected} onClose={() => setSelected(undefined)} /> : <MaterialDetails id={selected.id} onClose={() => setSelected(undefined)} renderActions={renderActions} />)}
    </Card>
  );
}

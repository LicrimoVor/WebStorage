import {ReleasedStock} from './ReleasedStock';
import {PlanProduction} from './PlanProduction';
import {Select, TextInput} from '@/shared/ui/FormControls';
import { Wrench } from "@gravity-ui/icons";
import {Alert, Button, Card, Dialog, Label, Pagination, PlaceholderContainer, Skeleton, Tab, TabList, Text} from '@gravity-ui/uikit';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProductionPage } from "@/pages/BusinessPages";

import { useManufacturedItemsQuery } from "@/entities/ManufacturedItem";
import {
  useProductionRecordsQuery,
  type ProductionRecord,
} from "@/entities/Production";
import {
  createProductionPlan,
  productionPlanKeys,
  recalculateProductionPlan,
  updateProductionPlan,
  useProductionPlanSummaryQuery,
  useProductionPlansQuery,
  type ProductionPlan,
  type ProductionPlanStatus,
} from "@/entities/ProductionPlan";
import { ExportExcelButton } from "@/features/ExportExcel";
import { getErrorMessage } from "@/shared/api";
import { formatDateTime, formatDecimal, isDecimal, normalizeDecimal } from "@/shared/lib";

import styles from "./ProductionPlansPage.module.scss";

const statusView: Record<
  ProductionPlanStatus,
  { text: string; theme: "info" | "success" | "warning" | "normal" }
> = {
  draft: { text: "Черновик", theme: "info" },
  active: { text: "В работе", theme: "success" },
  completed: { text: "Завершён", theme: "normal" },
  cancelled: { text: "Отменён", theme: "warning" },
};

const statusOptions = [
  { value: "all", content: "Все планы" },
  { value: "active", content: "Активные" },
  { value: "draft", content: "Черновики" },
  { value: "completed", content: "Завершённые" },
  { value: "cancelled", content: "Отменённые" },
];

function amount(value: string | null, suffix = ""): string {
  return value === null ? "—" : `${formatDecimal(value)}${suffix}`;
}

function CreatePlanButton() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const queryClient = useQueryClient();
  const productsQuery = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    kind: "product",
    sort_by: "name",
    sort_order: "asc",
  });
  const mutation = useMutation({
    mutationFn: () =>
      createProductionPlan({
        product_id: productId,
        planned_quantity: quantity.replace(",", "."),
        target_date: targetDate || null,
        status: "active",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productionPlanKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
      await queryClient.invalidateQueries({ queryKey: ["manufactured-items"] });
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      setOpen(false);
      setProductId("");
      setQuantity("");
      setTargetDate("");
    },
  });
  const validQuantity = Number(quantity.replace(",", ".")) > 0;
  const close = () => {
    if (!mutation.isPending) {
      mutation.reset();
      setOpen(false);
    }
  };
  return (
    <>
      <Button view="action" size="l" onClick={() => setOpen(true)}>
        Создать план
      </Button>
      <Dialog open={open} onClose={close} maxWidth="m" fullWidth>
        <Dialog.Header caption="Новый производственный план" />
        <Dialog.Body>
          <div className={styles.form}>
            <Select
              options={
                productsQuery.data?.items.map((product) => ({
                  value: product.id,
                  content: product.name,
                })) ?? []
              }
              value={productId ? [productId] : []}
              onUpdate={(values) => setProductId(values[0] ?? "")}
              label="Продукт"
              placeholder={
                productsQuery.isPending ? "Загрузка…" : "Выберите продукт"
              }
              width="max"
              size="l"
              aria-label="Продукт производственного плана"
            />
            <TextInput
              value={quantity}
              onUpdate={setQuantity}
              label="Количество"
              placeholder="0,00"
              size="l"
              controlProps={{
                inputMode: "decimal",
                "aria-label": "Количество продукта",
              }}
            />
            <label className={styles.dateField}>
              <span>Плановая дата</span>
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                aria-label="Плановая дата"
              />
            </label>
            {mutation.error ? (
              <Alert theme="danger" message={getErrorMessage(mutation.error)} />
            ) : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Рассчитать"
          textButtonCancel="Отмена"
          onClickButtonApply={() => mutation.mutate()}
          onClickButtonCancel={close}
          loading={mutation.isPending}
          propsButtonApply={{ disabled: !productId || !validQuantity }}
        />
      </Dialog>
    </>
  );
}

function EditPlanButton({plan, onSaved}: {plan: ProductionPlan; onSaved: () => Promise<void>}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(plan.planned_quantity);
  const [targetDate, setTargetDate] = useState(plan.target_date ?? '');
  const mutation = useMutation({
    mutationFn: () => updateProductionPlan(plan.id, {
      planned_quantity: normalizeDecimal(quantity), target_date: targetDate || null,
    }),
    onSuccess: async () => {await onSaved(); setOpen(false);},
  });
  const valid = isDecimal(quantity) && Number(normalizeDecimal(quantity)) > 0 &&
    Number(normalizeDecimal(quantity)) >= Number(plan.produced_quantity);
  const close = () => {if (!mutation.isPending) {setOpen(false); mutation.reset();}};
  return <>
    <Button view="outlined" onClick={() => {
      setQuantity(formatDecimal(plan.planned_quantity).replaceAll(' ', ''));
      setTargetDate(plan.target_date ?? ''); mutation.reset(); setOpen(true);
    }}>Редактировать</Button>
    <Dialog open={open} onClose={close} maxWidth="m" fullWidth>
      <Dialog.Header caption={`Редактирование плана: ${plan.product_name}`} />
      <Dialog.Body><div className={styles.form}>
        <Text color="secondary">Уже изготовлено: {amount(plan.produced_quantity, ` ${plan.product_unit}`)}.</Text>
        <TextInput label="Количество" value={quantity} onUpdate={setQuantity}
          controlProps={{inputMode: 'decimal', 'aria-label': 'Плановое количество'}} />
        <label className={styles.dateField}><span>Плановая дата</span>
          <input type="date" aria-label="Плановая дата" value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)} /></label>
        {!valid && <Text color="danger">Количество должно быть положительным и не меньше уже изготовленного.</Text>}
        {mutation.error && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
      </div></Dialog.Body>
      <Dialog.Footer textButtonApply="Сохранить" textButtonCancel="Закрыть"
        onClickButtonApply={() => mutation.mutate()} onClickButtonCancel={close}
        loading={mutation.isPending} propsButtonApply={{disabled: !valid}} />
    </Dialog>
  </>;
}

type RequirementTab = 'materials' | 'semis' | 'operations';

function RequirementTable({plan, tab}: {plan: ProductionPlan; tab: RequirementTab}) {
  const semis = plan.manufactured_items.filter((item) => !item.is_plan_output);
  return (
    <div className={styles.requirements}>
      {tab === 'materials' && (<section>
        <Text as="h4" variant="subheader-2">
          Материалы
        </Text>
        {plan.materials.length ? (
          <table><colgroup><col className={styles.positionColumn} /><col /><col /><col /></colgroup>
            <thead>
              <tr>
                <th>Позиция</th>
                <th data-numeric>Нужно</th>
                <th data-numeric>Со склада</th>
                <th data-numeric>Дефицит</th>
              </tr>
            </thead>
            <tbody>
              {plan.materials.map((item) => (
                <tr key={item.material_id}>
                  <td><div className={styles.positionName} tabIndex={0} title={item.name}
                    aria-label={`Название позиции: ${item.name}`}>{item.name}</div></td>
                  <td data-numeric>{amount(item.required_quantity, ` ${item.unit}`)}</td>
                  <td data-numeric>{amount(item.stock_used_quantity, ` ${item.unit}`)}</td>
                  <td data-numeric
                    className={
                      Number(item.deficit_quantity) > 0
                        ? styles.deficit
                        : undefined
                    }
                  >
                    {amount(item.deficit_quantity, ` ${item.unit}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Text color="secondary">Дополнительные материалы не требуются.</Text>
        )}
      </section>)}
      {tab === 'semis' && (<section>
        <Text as="h4" variant="subheader-2">
          Полуфабрикаты
        </Text>
        {semis.length ? (
          <table><colgroup><col className={styles.positionColumn} /><col /><col /><col /></colgroup>
            <thead>
              <tr>
                <th>Позиция</th>
                <th data-numeric>Нужно</th>
                <th data-numeric>Со склада</th>
                <th data-numeric>Изготовить</th>
              </tr>
            </thead>
            <tbody>
              {semis.map((item) => (
                <tr key={item.manufactured_item_id}>
                  <td><div className={styles.positionName} tabIndex={0} title={item.name}
                    aria-label={`Название позиции: ${item.name}`}>{item.name}</div></td>
                  <td data-numeric>{amount(item.required_quantity, ` ${item.unit}`)}</td>
                  <td data-numeric>{amount(item.stock_used_quantity, ` ${item.unit}`)}</td>
                  <td data-numeric>{amount(item.to_produce_quantity, ` ${item.unit}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Text color="secondary">Вложенных полуфабрикатов нет.</Text>
        )}
      </section>)}
      {tab === 'operations' && (<section>
        <Text as="h4" variant="subheader-2">
          Операции
        </Text>
        {plan.operations.length ? (
          <table><colgroup><col className={styles.positionColumn} /><col /><col /><col /></colgroup>
            <thead>
              <tr>
                <th>Позиция</th>
                <th data-numeric>Количество</th>
                <th data-numeric>Время, мин</th>
                <th data-numeric>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {plan.operations.map((item) => (
                <tr key={item.operation_id}>
                  <td><div className={styles.positionName} tabIndex={0} title={item.name}
                    aria-label={`Название позиции: ${item.name}`}>{item.name}</div></td>
                  <td data-numeric>{amount(item.required_quantity)}</td>
                  <td data-numeric>{amount(item.required_time_minutes)}</td>
                  <td data-numeric>{amount(item.cost, " ₽")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Text color="secondary">Операции не требуются.</Text>
        )}
      </section>)}
    </div>
  );
}

function RequirementsButton({plan}: {plan: ProductionPlan}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<RequirementTab>('materials');
  return <>
    <Button view="outlined" className={styles.requirementsOpen} onClick={() => setOpen(true)}>Потребности в материалах и операциях</Button>
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="l" fullWidth>
      <Dialog.Header caption="Потребности в материалах и операциях" />
      <Dialog.Body className={styles.requirementsBody}>
        <Text as="div" variant="subheader-2" className={styles.requirementsProduct}>{plan.product_name}</Text>
        <Text as="div" color="secondary">Осталось изготовить: {amount(plan.remaining_quantity, ` ${plan.product_unit}`)}</Text>
        <TabList value={tab} onUpdate={(value) => setTab(value as RequirementTab)}>
          <Tab value="materials">Материалы</Tab>
          <Tab value="semis">Полуфабрикаты</Tab>
          <Tab value="operations">Операции</Tab>
        </TabList>
        <RequirementTable plan={plan} tab={tab} />
      </Dialog.Body>
      <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setOpen(false)} />
    </Dialog>
  </>;
}

function ProductionRecordRow({ record }: { record: ProductionRecord }) {
  return (
    <li>
      <div>
        <b>{record.item_name}</b>
        <Text color="secondary">{formatDateTime(record.created_at)}</Text>
      </div>
      <span>{amount(record.quantity, ` ${record.item_unit}`)}</span>
      <Text color="secondary">
        {record.components.length
          ? `Списано: ${record.components
              .map((component) =>
                amount(
                  component.quantity,
                  ` ${component.unit} ${component.name}`,
                ),
              )
              .join(" · ")}`
          : "Без складских компонентов"}
      </Text>
    </li>
  );
}

function ProductionHistory({
  planId,
  enabled,
}: {
  planId: string;
  enabled: boolean;
}) {
  const query = useProductionRecordsQuery(planId, enabled);
  if (query.isPending) return <Skeleton className={styles.historySkeleton} />;
  if (query.isError) {
    return <Alert theme="danger" message={getErrorMessage(query.error)} />;
  }
  if (!query.data.items.length) {
    return (
      <Text color="secondary">Выпуск по плану ещё не регистрировался.</Text>
    );
  }
  return (
    <ul className={styles.historyList}>
      {query.data.items.map((record) => (
        <ProductionRecordRow key={record.id} record={record} />
      ))}
    </ul>
  );
}

function PlanCard({ plan }: { plan: ProductionPlan }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: productionPlanKeys.all });
    await queryClient.invalidateQueries({ queryKey: ["materials"] });
    await queryClient.invalidateQueries({ queryKey: ["manufactured-items"] });
    await queryClient.invalidateQueries({ queryKey: ["operations"] });
  };
  const recalculate = useMutation({
    mutationFn: () => recalculateProductionPlan(plan.id),
    onSuccess: refresh,
  });
  return (
    <Card view="outlined" className={styles.planCard}>
      <div className={styles.planHeading}>
        <div>
          <div className={styles.titleRow}>
            <Text as="h3" variant="header-2">
              {plan.product_name}
            </Text>
            <Label theme={statusView[plan.status].theme}>
              {statusView[plan.status].text}
            </Label>
          </div>
          <Text color="secondary">
            Версия процесса v{plan.process_version_number} ·{" "}
            {formatDateTime(plan.created_at)}
          </Text>
        </div>
        <div className={styles.planActions}>
          <DeleteEntityButton kind="production_plan" id={plan.id} name={plan.product_name} />
          {plan.status === "active" || plan.status === "draft" ? (
            <>
              <Button
                view="outlined"
                loading={recalculate.isPending}
                onClick={() => recalculate.mutate()}
              >
                Пересчитать
              </Button>
              <EditPlanButton plan={plan} onSaved={refresh} />
            </>
          ) : null}
        </div>
      </div>
      <div className={styles.planMetrics}>
        <div><Text color="secondary">Плановая дата</Text><b>{plan.target_date?.split('-').reverse().join('.') ?? '—'}</b></div>
        <div>
          <Text color="secondary">План</Text>
          <b>{amount(plan.planned_quantity, ` ${plan.product_unit}`)}</b>
        </div>
        <div>
          <Text color="secondary">Готово</Text>
          <b>{amount(plan.produced_quantity, ` ${plan.product_unit}`)}</b>
        </div>
        <div>
          <Text color="secondary">Осталось</Text>
          <b>{amount(plan.remaining_quantity, ` ${plan.product_unit}`)}</b>
        </div>
        <div>
          <Text color="secondary">Трудоёмкость</Text>
          <b>{amount(plan.total_required_hours, " ч")}</b>
        </div>
        <div>
          <Text color="secondary">Стоимость</Text>
          <b>{amount(plan.estimated_cost, " ₽")}</b>
        </div>
      </div>
      {!plan.calculation_complete ? (
        <Alert
          theme="warning"
          title="Расчёт неполный"
          message={plan.missing_data.join(" · ")}
        />
      ) : null}
      {recalculate.error ? (
        <Alert
          theme="danger"
          message={getErrorMessage(recalculate.error)}
        />
      ) : null}
      <div className={styles.planButtons}><RequirementsButton plan={plan} />
        {plan.status === "active" && <PlanProduction plan={plan} />}</div>
      <details
        className={styles.details}
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary>История производства</summary>
        {historyOpen ? (
          <div className={styles.history}>
            <ProductionHistory planId={plan.id} enabled={historyOpen} />
          </div>
        ) : null}
      </details>
    </Card>
  );
}

function PlanningListPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<"all" | ProductionPlanStatus>("active");
  const query = useProductionPlansQuery({
    page,
    page_size: pageSize,
    ...(status === "all" ? {} : { status }),
  });
  const summary = useProductionPlanSummaryQuery();
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">
            Планирование производства
          </Text>
        </div>
        <div className={styles.headerActions}>
          <ExportExcelButton
            dataset="production_plans"
            params={status === "all" ? {} : { plan_status: status }}
            label="Планы Excel"
          />
          <ExportExcelButton
            dataset="production_records"
            label="Выпуск Excel"
          />
          <CreatePlanButton />
        </div>
      </header>
      <div className={styles.summaryGrid}>
        <Card view="outlined">
          <Text color="secondary">Активных планов</Text>
          <strong>{summary.data?.active_plans ?? "—"}</strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Изделий к выпуску</Text>
          <strong>
            {summary.data ? amount(summary.data.products_to_produce) : "—"}
          </strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Позиций в дефиците</Text>
          <strong>{summary.data?.material_deficit_positions ?? "—"}</strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Всего часов</Text>
          <strong>
            {summary.data ? amount(summary.data.total_required_hours) : "—"}
          </strong>
        </Card>
        <Card view="outlined">
          <Text color="secondary">Оценка стоимости</Text>
          <strong>
            {summary.data ? amount(summary.data.estimated_cost, " ₽") : "—"}
          </strong>
        </Card>
      </div>
      <div className={styles.toolbar}>
        <Text as="h2" variant="header-2">
          Производственные планы
        </Text>
        <Select
          options={statusOptions}
          value={[status]}
          onUpdate={(values) => {
            setStatus((values[0] ?? "all") as "all" | ProductionPlanStatus);
            setPage(1);
          }}
          width="max"
          aria-label="Статус производственного плана"
        />
      </div>
      {query.isPending ? (
        <div className={styles.loading}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          theme="danger"
          title="Не удалось загрузить планы"
          message={getErrorMessage(query.error)}
          actions={<Button onClick={() => query.refetch()}>Повторить</Button>}
        />
      ) : query.data.items.length === 0 ? (
        <PlaceholderContainer
          image={<Wrench width={100} height={100} />}
          title="Планов пока нет"
          description="Создайте первый план — потребности будут рассчитаны автоматически."
          actions={<CreatePlanButton />}
        />
      ) : (
        <>
          <div className={styles.planList}>
            {query.data.items.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data.total}
            pageSizeOptions={[10, 20, 50]}
            onUpdate={(nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            }}
          />
        </>
      )}
    </main>
  );
}

export function ProductionPlansPage() {
  const [params, setParams] = useSearchParams();
  const release = params.get("tab") === "release";
  const stock = params.get("tab") === "stock";
  return (
    <>
      <nav className={styles.tabs} aria-label="Разделы планирования">
        <Button size="l" selected={!release && !stock} onClick={() => setParams({})}>
          Планы
        </Button>
        <Button
          size="l"
          selected={release}
          onClick={() => setParams({ tab: "release" })}
        >
          Выпуск продукции
        </Button>
        <Button size="l" selected={stock} onClick={() => setParams({tab: "stock"})}>Склад</Button>
      </nav>
      {stock ? <ReleasedStock /> : release ? <ProductionPage /> : <PlanningListPage />}
    </>
  );
}
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';

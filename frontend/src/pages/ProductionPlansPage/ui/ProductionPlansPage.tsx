import {Wrench} from '@gravity-ui/icons';
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
  Text,
  TextInput,
} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import {
  createProductionPlan,
  productionPlanKeys,
  recalculateProductionPlan,
  updateProductionPlan,
  useProductionPlanSummaryQuery,
  useProductionPlansQuery,
  type ProductionPlan,
  type ProductionPlanStatus,
} from '@/entities/ProductionPlan';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime, formatFixedDecimal} from '@/shared/lib';

import styles from './ProductionPlansPage.module.scss';

const statusView: Record<
  ProductionPlanStatus,
  {text: string; theme: 'info' | 'success' | 'warning' | 'normal'}
> = {
  draft: {text: 'Черновик', theme: 'info'},
  active: {text: 'В работе', theme: 'success'},
  completed: {text: 'Завершён', theme: 'normal'},
  cancelled: {text: 'Отменён', theme: 'warning'},
};

const statusOptions = [
  {value: 'all', content: 'Все планы'},
  {value: 'active', content: 'Активные'},
  {value: 'draft', content: 'Черновики'},
  {value: 'completed', content: 'Завершённые'},
  {value: 'cancelled', content: 'Отменённые'},
];

function amount(value: string | null, suffix = ''): string {
  return value === null ? '—' : `${formatFixedDecimal(value)}${suffix}`;
}

function CreatePlanButton() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const queryClient = useQueryClient();
  const productsQuery = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    kind: 'product',
    sort_by: 'name',
    sort_order: 'asc',
  });
  const mutation = useMutation({
    mutationFn: () =>
      createProductionPlan({
        product_id: productId,
        planned_quantity: quantity.replace(',', '.'),
        target_date: targetDate || null,
        status: 'active',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: productionPlanKeys.all});
      await queryClient.invalidateQueries({queryKey: ['materials']});
      await queryClient.invalidateQueries({queryKey: ['manufactured-items']});
      await queryClient.invalidateQueries({queryKey: ['operations']});
      setOpen(false);
      setProductId('');
      setQuantity('');
      setTargetDate('');
    },
  });
  const validQuantity = Number(quantity.replace(',', '.')) > 0;
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
              onUpdate={(values) => setProductId(values[0] ?? '')}
              label="Продукт"
              placeholder={productsQuery.isPending ? 'Загрузка…' : 'Выберите продукт'}
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
              controlProps={{inputMode: 'decimal', 'aria-label': 'Количество продукта'}}
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
          propsButtonApply={{disabled: !productId || !validQuantity}}
        />
      </Dialog>
    </>
  );
}

function RequirementTable({plan}: {plan: ProductionPlan}) {
  const semis = plan.manufactured_items.filter((item) => !item.is_plan_output);
  return (
    <div className={styles.requirements}>
      <section>
        <Text as="h4" variant="subheader-2">Материалы</Text>
        {plan.materials.length ? (
          <table>
            <thead><tr><th>Позиция</th><th>Нужно</th><th>Со склада</th><th>Дефицит</th></tr></thead>
            <tbody>
              {plan.materials.map((item) => (
                <tr key={item.material_id}>
                  <td>{item.name}</td>
                  <td>{amount(item.required_quantity, ` ${item.unit}`)}</td>
                  <td>{amount(item.stock_used_quantity, ` ${item.unit}`)}</td>
                  <td className={Number(item.deficit_quantity) > 0 ? styles.deficit : undefined}>
                    {amount(item.deficit_quantity, ` ${item.unit}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Text color="secondary">Дополнительные материалы не требуются.</Text>}
      </section>
      <section>
        <Text as="h4" variant="subheader-2">Полуфабрикаты</Text>
        {semis.length ? (
          <table>
            <thead><tr><th>Позиция</th><th>Нужно</th><th>Со склада</th><th>Изготовить</th></tr></thead>
            <tbody>
              {semis.map((item) => (
                <tr key={item.manufactured_item_id}>
                  <td>{item.name}</td>
                  <td>{amount(item.required_quantity, ` ${item.unit}`)}</td>
                  <td>{amount(item.stock_used_quantity, ` ${item.unit}`)}</td>
                  <td>{amount(item.to_produce_quantity, ` ${item.unit}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Text color="secondary">Вложенных полуфабрикатов нет.</Text>}
      </section>
      <section>
        <Text as="h4" variant="subheader-2">Операции</Text>
        {plan.operations.length ? (
          <table>
            <thead><tr><th>Операция</th><th>Количество</th><th>Время, мин</th><th>Стоимость</th></tr></thead>
            <tbody>
              {plan.operations.map((item) => (
                <tr key={item.operation_id}>
                  <td>{item.name}</td>
                  <td>{amount(item.required_quantity)}</td>
                  <td>{amount(item.required_time_minutes)}</td>
                  <td>{amount(item.cost, ' ₽')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Text color="secondary">Операции не требуются.</Text>}
      </section>
    </div>
  );
}

function PlanCard({plan}: {plan: ProductionPlan}) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({queryKey: productionPlanKeys.all});
    await queryClient.invalidateQueries({queryKey: ['materials']});
    await queryClient.invalidateQueries({queryKey: ['manufactured-items']});
    await queryClient.invalidateQueries({queryKey: ['operations']});
  };
  const recalculate = useMutation({
    mutationFn: () => recalculateProductionPlan(plan.id),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: () => updateProductionPlan(plan.id, {status: 'cancelled'}),
    onSuccess: refresh,
  });
  return (
    <Card view="outlined" className={styles.planCard}>
      <div className={styles.planHeading}>
        <div>
          <div className={styles.titleRow}>
            <Text as="h3" variant="header-2">{plan.product_name}</Text>
            <Label theme={statusView[plan.status].theme}>{statusView[plan.status].text}</Label>
          </div>
          <Text color="secondary">
            Версия процесса v{plan.process_version_number} · {formatDateTime(plan.created_at)}
          </Text>
        </div>
        <div className={styles.planActions}>
          {plan.status === 'active' || plan.status === 'draft' ? (
            <>
              <Button
                view="outlined"
                loading={recalculate.isPending}
                onClick={() => recalculate.mutate()}
              >
                Пересчитать
              </Button>
              <Button
                view="flat-danger"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Отменить
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <div className={styles.planMetrics}>
        <div><Text color="secondary">План</Text><b>{amount(plan.planned_quantity, ` ${plan.product_unit}`)}</b></div>
        <div><Text color="secondary">Готово</Text><b>{amount(plan.produced_quantity, ` ${plan.product_unit}`)}</b></div>
        <div><Text color="secondary">Осталось</Text><b>{amount(plan.remaining_quantity, ` ${plan.product_unit}`)}</b></div>
        <div><Text color="secondary">Трудоёмкость</Text><b>{amount(plan.total_required_hours, ' ч')}</b></div>
        <div><Text color="secondary">Стоимость</Text><b>{amount(plan.estimated_cost, ' ₽')}</b></div>
      </div>
      {!plan.calculation_complete ? (
        <Alert
          theme="warning"
          title="Расчёт неполный"
          message={plan.missing_data.join(' · ')}
        />
      ) : null}
      {recalculate.error || cancel.error ? (
        <Alert theme="danger" message={getErrorMessage(recalculate.error ?? cancel.error)} />
      ) : null}
      <details className={styles.details}>
        <summary>Показать рассчитанные потребности</summary>
        <RequirementTable plan={plan} />
      </details>
    </Card>
  );
}

export function ProductionPlansPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<'all' | ProductionPlanStatus>('all');
  const query = useProductionPlansQuery({
    page,
    page_size: pageSize,
    ...(status === 'all' ? {} : {status}),
  });
  const summary = useProductionPlanSummaryQuery();
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <Text as="h1" variant="display-1">Планирование производства</Text>
          <Text as="p" color="secondary">
            Расчёт материалов, полуфабрикатов, операций, времени и дефицита.
          </Text>
        </div>
        <CreatePlanButton />
      </header>
      <div className={styles.summaryGrid}>
        <Card view="outlined"><Text color="secondary">Активных планов</Text><strong>{summary.data?.active_plans ?? '—'}</strong></Card>
        <Card view="outlined"><Text color="secondary">Изделий к выпуску</Text><strong>{summary.data ? amount(summary.data.products_to_produce) : '—'}</strong></Card>
        <Card view="outlined"><Text color="secondary">Позиций в дефиците</Text><strong>{summary.data?.material_deficit_positions ?? '—'}</strong></Card>
        <Card view="outlined"><Text color="secondary">Всего часов</Text><strong>{summary.data ? amount(summary.data.total_required_hours) : '—'}</strong></Card>
        <Card view="outlined"><Text color="secondary">Оценка стоимости</Text><strong>{summary.data ? amount(summary.data.estimated_cost, ' ₽') : '—'}</strong></Card>
      </div>
      <div className={styles.toolbar}>
        <Text as="h2" variant="header-2">Производственные планы</Text>
        <Select
          options={statusOptions}
          value={[status]}
          onUpdate={(values) => {
            setStatus((values[0] ?? 'all') as 'all' | ProductionPlanStatus);
            setPage(1);
          }}
          width="max"
          aria-label="Статус производственного плана"
        />
      </div>
      {query.isPending ? (
        <div className={styles.loading}>
          {Array.from({length: 3}, (_, index) => <Skeleton key={index} className={styles.skeleton} />)}
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
          image={<Wrench />}
          title="Планов пока нет"
          description="Создайте первый план — потребности будут рассчитаны автоматически."
          actions={<CreatePlanButton />}
        />
      ) : (
        <>
          <div className={styles.planList}>
            {query.data.items.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
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

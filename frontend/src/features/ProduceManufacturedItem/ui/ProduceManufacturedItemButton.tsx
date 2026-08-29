import {Alert, Button, Dialog, Select, Skeleton, Text, TextInput} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {employeeKeys, useEmployeesQuery} from '@/entities/Employee';
import {manufacturedItemKeys} from '@/entities/ManufacturedItem';
import {materialKeys} from '@/entities/Material';
import {operationKeys} from '@/entities/Operation';
import {
  productionKeys,
  registerDirectProduction,
  useDirectProductionPreviewQuery,
  type DirectProductionTree,
} from '@/entities/Production';
import {workPayrollKeys} from '@/entities/WorkPayroll';
import {getErrorMessage} from '@/shared/api';
import {formatDecimal, isDecimal, normalizeDecimal} from '@/shared/lib';

import styles from './ProduceManufacturedItemButton.module.scss';

interface ProduceManufacturedItemButtonProps {
  itemId: string;
  itemName: string;
  size?: 's' | 'm' | 'l' | 'xl';
  view?: 'flat-action' | 'action' | 'outlined';
  label?: string;
}

function ProductionTree({node}: {node: DirectProductionTree}) {
  return (
    <li>
      <div className={styles.treeRow}>
        <Text variant="subheader-1">{node.name}</Text>
        <Text color="secondary">
          требуется {formatDecimal(node.required_quantity)} {node.unit}; со склада{' '}
          {formatDecimal(node.stock_used_quantity)}; произвести{' '}
          {formatDecimal(node.to_produce_quantity)}
        </Text>
        {node.recipe_source ? (
          <Text color="secondary" variant="caption-2">
            {node.recipe_source}
          </Text>
        ) : null}
      </div>
      {node.children?.length ? (
        <ul className={styles.tree}>{node.children.map((child) => <ProductionTree key={`${child.item_id}-${child.recipe_source}`} node={child} />)}</ul>
      ) : null}
    </li>
  );
}

export function ProduceManufacturedItemButton({
  itemId,
  itemName,
  size = 's',
  view = 'flat-action',
  label = 'Произвести',
}: ProduceManufacturedItemButtonProps) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [comment, setComment] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const normalizedQuantity = isDecimal(quantity) ? normalizeDecimal(quantity) : '';
  const quantityValid = Boolean(normalizedQuantity) && Number(normalizedQuantity) > 0;
  const preview = useDirectProductionPreviewQuery(
    itemId,
    normalizedQuantity,
    open && quantityValid,
  );
  const employees = useEmployeesQuery(
    {
      page: 1,
      page_size: 100,
      include_inactive: false,
      sort_by: 'full_name',
      sort_order: 'asc',
    },
    open,
  );
  const mutation = useMutation({
    mutationFn: () =>
      registerDirectProduction(
        itemId,
        {
          quantity: normalizedQuantity,
          operation_assignments: (preview.data?.operations ?? [])
            .filter((operation) => Boolean(assignments[operation.operation_id]))
            .map((operation) => ({
              operation_id: operation.operation_id,
              employee_id: assignments[operation.operation_id] || null,
            })),
          comment: comment.trim() || null,
        },
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: manufacturedItemKeys.all}),
        queryClient.invalidateQueries({queryKey: materialKeys.all}),
        queryClient.invalidateQueries({queryKey: operationKeys.all}),
        queryClient.invalidateQueries({queryKey: employeeKeys.all}),
        queryClient.invalidateQueries({queryKey: workPayrollKeys.all}),
        queryClient.invalidateQueries({queryKey: productionKeys.all}),
      ]);
      setOpen(false);
      setQuantity('1');
      setComment('');
      setAssignments({});
    },
  });
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    if (!quantityValid) {
      setValidationError('Укажите положительное количество.');
      return;
    }
    if (!preview.data?.can_produce) {
      setValidationError('Для производства не хватает материалов.');
      return;
    }
    setValidationError(undefined);
    mutation.mutate();
  };
  const employeeOptions = [
    {value: '', content: 'Анонимно'},
    ...(employees.data?.items ?? []).map((employee) => ({
      value: employee.id,
      content: `${employee.full_name} · ${employee.compensation_type === 'hourly' ? 'почасовая' : 'сдельная'}`,
    })),
  ];

  return (
    <>
      <Button
        view={view}
        size={size}
        onClick={() => {
          setValidationError(undefined);
          mutation.reset();
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        maxWidth="l"
        fullWidth
        contentOverflow="auto"
      >
        <Dialog.Header caption={`Произвести: ${itemName}`} />
        <Dialog.Body>
          <div className={styles.content}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <TextInput
              label="Количество"
              value={quantity}
              onUpdate={(value) => {
                setQuantity(value);
                setValidationError(undefined);
              }}
              controlProps={{'aria-label': 'Количество для производства', inputMode: 'decimal'}}
              size="l"
              autoFocus
            />
            {preview.isPending && quantityValid ? (
              <Skeleton className={styles.loading} />
            ) : preview.isError ? (
              <Alert
                theme="danger"
                title="Не удалось рассчитать производство"
                message={getErrorMessage(preview.error)}
              />
            ) : preview.data ? (
              <>
                {!preview.data.can_produce ? (
                  <Alert
                    theme="warning"
                    title="Недостаточно материалов"
                    message="Производство не будет проведено, пока дефицит не будет пополнен."
                  />
                ) : null}
                <section className={styles.section}>
                  <Text as="h3" variant="subheader-2">Поддерево производства</Text>
                  <ul className={styles.tree}><ProductionTree node={preview.data.tree} /></ul>
                </section>
                <section className={styles.section}>
                  <Text as="h3" variant="subheader-2">Материалы</Text>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Материал</th><th>Требуется</th><th>Со склада</th><th>Дефицит</th></tr></thead>
                      <tbody>
                        {preview.data.materials.map((material) => (
                          <tr key={material.material_id}>
                            <td>{material.name}</td>
                            <td>{formatDecimal(material.required_quantity)} {material.unit}</td>
                            <td>{formatDecimal(material.stock_used_quantity)} {material.unit}</td>
                            <td>{formatDecimal(material.deficit_quantity)} {material.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className={styles.section}>
                  <Text as="h3" variant="subheader-2">Операции</Text>
                  <div className={styles.operations}>
                    {preview.data.operations.map((operation) => (
                      <div className={styles.operation} key={operation.operation_id}>
                        <div>
                          <Text variant="subheader-1">{operation.name}</Text>
                          <Text as="div" color="secondary">
                            {formatDecimal(operation.required_quantity)} операций
                            {operation.required_time_minutes
                              ? ` · ${formatDecimal(operation.required_time_minutes)} мин.`
                              : ' · норма времени не указана'}
                          </Text>
                        </div>
                        <Select
                          label="Исполнитель"
                          options={employeeOptions}
                          value={[assignments[operation.operation_id] ?? '']}
                          onUpdate={(values) =>
                            setAssignments((current) => ({
                              ...current,
                              [operation.operation_id]: values[0] ?? '',
                            }))
                          }
                          loading={employees.isPending}
                          width="max"
                          filterable
                        />
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
            <TextInput
              label="Комментарий"
              value={comment}
              onUpdate={setComment}
              size="l"
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Произвести"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
          propsButtonApply={{disabled: !preview.data?.can_produce}}
        />
      </Dialog>
    </>
  );
}

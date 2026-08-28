import {Alert, Button, Dialog, Select, TextInput} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createManufacturedItemMovement,
  manufacturedItemKeys,
  type InventoryMovementCreate,
  type ManualMovementType,
  type ManufacturedItem,
} from '@/entities/ManufacturedItem';
import {getErrorMessage} from '@/shared/api';
import {isDecimal, normalizeDecimal} from '@/shared/lib';

import styles from './AdjustManufacturedStockButton.module.scss';

const movementOptions: Array<{value: ManualMovementType; content: string}> = [
  {value: 'receipt', content: 'Приход'},
  {value: 'consumption', content: 'Расход'},
  {value: 'adjustment', content: 'Корректировка (дельта)'},
  {value: 'write_off', content: 'Списание'},
];

interface AdjustManufacturedStockButtonProps {
  item: ManufacturedItem;
}

export function AdjustManufacturedStockButton({
  item,
}: AdjustManufacturedStockButtonProps) {
  const [open, setOpen] = useState(false);
  const [movementType, setMovementType] =
    useState<ManualMovementType>('receipt');
  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const titleId = `adjust-manufactured-stock-${item.id}`;
  const mutation = useMutation({
    mutationFn: (payload: InventoryMovementCreate) =>
      createManufacturedItemMovement(item.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: manufacturedItemKeys.all});
      setOpen(false);
      setQuantity('');
      setComment('');
    },
  });

  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    const allowNegative = movementType === 'adjustment';
    if (
      !isDecimal(quantity, {allowNegative}) ||
      Number(normalizeDecimal(quantity)) === 0
    ) {
      setValidationError(
        allowNegative
          ? 'Укажите ненулевую дельту с точностью до 6 знаков.'
          : 'Укажите положительное количество с точностью до 6 знаков.',
      );
      return;
    }
    setValidationError(undefined);
    mutation.mutate({
      movement_type: movementType,
      quantity: normalizeDecimal(quantity),
      comment: comment.trim() || null,
    });
  };

  return (
    <>
      <Button view="flat-action" size="s" onClick={() => setOpen(true)}>
        Остаток
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        aria-labelledby={titleId}
        maxWidth="s"
        fullWidth
      >
        <Dialog.Header caption={`Изменить остаток: ${item.name}`} id={titleId} />
        <Dialog.Body>
          <div className={styles.form}>
            {validationError || mutation.error ? (
              <Alert
                theme="danger"
                message={validationError ?? getErrorMessage(mutation.error)}
              />
            ) : null}
            <Alert
              theme="info"
              view="outlined"
              message={`Текущий остаток: ${item.free_quantity} ${item.unit}`}
            />
            <Select
              label="Тип"
              options={movementOptions}
              value={[movementType]}
              onUpdate={(values) => {
                const next = values[0];
                if (next) setMovementType(next as ManualMovementType);
              }}
              width="max"
              size="l"
              aria-label="Тип движения производимой позиции"
            />
            <TextInput
              label={movementType === 'adjustment' ? 'Дельта' : 'Количество'}
              value={quantity}
              onUpdate={setQuantity}
              controlProps={{
                'aria-label': 'Количество движения производимой позиции',
                inputMode: 'decimal',
              }}
              placeholder={movementType === 'adjustment' ? '-2,5 или 3' : '0'}
              size="l"
              autoFocus
            />
            <TextInput
              label="Комментарий"
              value={comment}
              onUpdate={setComment}
              controlProps={{'aria-label': 'Комментарий движения производимой позиции'}}
              hasClear
              size="l"
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Провести"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

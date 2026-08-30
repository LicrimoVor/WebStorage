import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createManufacturedItem,
  emptyManufacturedItemForm,
  manufacturedItemKeys,
  ManufacturedItemForm,
  validateManufacturedItemForm,
  type ManufacturedItemCreate,
  type ManufacturedItemFormValue,
} from '@/entities/ManufacturedItem';
import {getErrorMessage} from '@/shared/api';
import {inventoryGroupKeys} from '@/entities/InventoryGroup';
import {normalizeDecimal} from '@/shared/lib';

const titleId = 'create-manufactured-item-title';

interface CreateManufacturedItemButtonProps {
  defaultIsProduct?: boolean;
  buttonLabel?: string;
}

export function CreateManufacturedItemButton({
  defaultIsProduct = false,
  buttonLabel = 'Создать позицию',
}: CreateManufacturedItemButtonProps) {
  const [open, setOpen] = useState(false);
  const initialForm = (): ManufacturedItemFormValue => ({
    ...emptyManufacturedItemForm,
    isProduct: defaultIsProduct,
  });
  const [form, setForm] = useState<ManufacturedItemFormValue>(initialForm);
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: ManufacturedItemCreate) =>
      createManufacturedItem(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: manufacturedItemKeys.all});
      await queryClient.invalidateQueries({queryKey: inventoryGroupKeys.all});
      setOpen(false);
      setForm(initialForm());
      setValidationError(undefined);
    },
  });

  const close = () => {
    if (!mutation.isPending) {
      setOpen(false);
      setValidationError(undefined);
      mutation.reset();
    }
  };
  const submit = () => {
    const error = validateManufacturedItemForm(form, true);
    if (error) {
      setValidationError(error);
      return;
    }
    const payload: ManufacturedItemCreate = {
      name: form.name.trim(),
      is_product: form.isProduct,
      unit: form.unit.trim(),
      initial_quantity: normalizeDecimal(form.initialQuantity),
      image: form.image || null,
      group_ids: form.groupIds,
    };
    setValidationError(undefined);
    mutation.mutate(payload);
  };

  return (
    <>
      <Button view="action" size="l" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        aria-labelledby={titleId}
        maxWidth="m"
        fullWidth
      >
        <Dialog.Header
          caption={defaultIsProduct ? 'Новый продукт' : 'Новый полуфабрикат'}
          id={titleId}
        />
        <Dialog.Body>
          <ManufacturedItemForm
            value={form}
            onChange={setForm}
            includeInitialQuantity
            error={
              validationError ??
              (mutation.error ? getErrorMessage(mutation.error) : undefined)
            }
          />
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Создать"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

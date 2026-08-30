import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  manufacturedItemKeys,
  manufacturedItemToForm,
  ManufacturedItemForm,
  updateManufacturedItem,
  validateManufacturedItemForm,
  type ManufacturedItem,
  type ManufacturedItemFormValue,
  type ManufacturedItemUpdate,
} from '@/entities/ManufacturedItem';
import {getErrorMessage} from '@/shared/api';
import {inventoryGroupKeys} from '@/entities/InventoryGroup';

interface EditManufacturedItemButtonProps {
  item: ManufacturedItem;
}

export function EditManufacturedItemButton({item}: EditManufacturedItemButtonProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManufacturedItemFormValue>(() =>
    manufacturedItemToForm(item),
  );
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const titleId = `edit-manufactured-item-${item.id}`;
  const mutation = useMutation({
    mutationFn: (payload: ManufacturedItemUpdate) =>
      updateManufacturedItem(item.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: manufacturedItemKeys.all});
      await queryClient.invalidateQueries({queryKey: inventoryGroupKeys.all});
      setOpen(false);
    },
  });

  const openDialog = () => {
    setForm(manufacturedItemToForm(item));
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    const error = validateManufacturedItemForm(form, false);
    if (error) {
      setValidationError(error);
      return;
    }
    mutation.mutate({
      name: form.name.trim(),
      is_product: form.isProduct,
      unit: form.unit.trim(),
      image: form.image || null,
      group_ids: form.groupIds,
    });
  };

  return (
    <>
      <Button view="flat" size="s" onClick={openDialog}>
        Изменить
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        aria-labelledby={titleId}
        maxWidth="m"
        fullWidth
      >
        <Dialog.Header caption={`Редактировать: ${item.name}`} id={titleId} />
        <Dialog.Body>
          <ManufacturedItemForm
            value={form}
            onChange={setForm}
            error={
              validationError ??
              (mutation.error ? getErrorMessage(mutation.error) : undefined)
            }
          />
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Сохранить"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

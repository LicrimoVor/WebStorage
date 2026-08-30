import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  materialKeys,
  materialToForm,
  MaterialForm,
  updateMaterial,
  validateMaterialForm,
  type Material,
  type MaterialFormValue,
  type MaterialUpdate,
} from '@/entities/Material';
import {getErrorMessage} from '@/shared/api';
import {inventoryGroupKeys} from '@/entities/InventoryGroup';
import {normalizeDecimal} from '@/shared/lib';

interface EditMaterialButtonProps {
  material: Material;
}

export function EditMaterialButton({material}: EditMaterialButtonProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MaterialFormValue>(() => materialToForm(material));
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const titleId = `edit-material-${material.id}`;
  const mutation = useMutation({
    mutationFn: (payload: MaterialUpdate) => updateMaterial(material.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: materialKeys.all});
      await queryClient.invalidateQueries({queryKey: inventoryGroupKeys.all});
      setOpen(false);
    },
  });

  const openDialog = () => {
    setForm(materialToForm(material));
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
  const submit = () => {
    const error = validateMaterialForm(form, false);
    if (error) {
      setValidationError(error);
      return;
    }
    mutation.mutate({
      name: form.name.trim(),
      unit: form.unit.trim(),
      price: form.price ? normalizeDecimal(form.price) : null,
      url: form.url || null,
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
        <Dialog.Header caption={`Редактировать: ${material.name}`} id={titleId} />
        <Dialog.Body>
          <MaterialForm
            value={form}
            onChange={setForm}
            error={validationError ?? (mutation.error ? getErrorMessage(mutation.error) : undefined)}
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

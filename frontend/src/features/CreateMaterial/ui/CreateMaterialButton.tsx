import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createMaterial,
  emptyMaterialForm,
  materialKeys,
  MaterialForm,
  validateMaterialForm,
  type MaterialCreate,
  type MaterialFormValue,
} from '@/entities/Material';
import {getErrorMessage} from '@/shared/api';
import {normalizeDecimal} from '@/shared/lib';

const titleId = 'create-material-title';

export function CreateMaterialButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MaterialFormValue>(emptyMaterialForm);
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: MaterialCreate) => createMaterial(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: materialKeys.all});
      setOpen(false);
      setForm(emptyMaterialForm);
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
    const error = validateMaterialForm(form, true);
    if (error) {
      setValidationError(error);
      return;
    }
    const payload: MaterialCreate = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      initial_quantity: normalizeDecimal(form.initialQuantity),
      price: form.price ? normalizeDecimal(form.price) : null,
      url: form.url || null,
      image: form.image || null,
    };
    setValidationError(undefined);
    mutation.mutate(payload);
  };

  return (
    <>
      <Button view="action" size="l" onClick={() => setOpen(true)}>
        Создать материал
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        aria-labelledby={titleId}
        maxWidth="m"
        fullWidth
      >
        <Dialog.Header caption="Новый материал" id={titleId} />
        <Dialog.Body>
          <MaterialForm
            value={form}
            onChange={setForm}
            includeInitialQuantity
            error={validationError ?? (mutation.error ? getErrorMessage(mutation.error) : undefined)}
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

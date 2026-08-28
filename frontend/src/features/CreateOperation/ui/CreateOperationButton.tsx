import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createOperation,
  emptyOperationForm,
  operationKeys,
  OperationForm,
  validateOperationForm,
  type OperationCreate,
  type OperationFormValue,
} from '@/entities/Operation';
import {getErrorMessage} from '@/shared/api';
import {normalizeDecimal} from '@/shared/lib';

export function CreateOperationButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OperationFormValue>(emptyOperationForm);
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: OperationCreate) => createOperation(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: operationKeys.all});
      setOpen(false);
      setForm(emptyOperationForm);
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
    const error = validateOperationForm(form);
    if (error) {
      setValidationError(error);
      return;
    }
    mutation.mutate({
      name: form.name.trim(),
      time_norm: form.timeNorm ? normalizeDecimal(form.timeNorm) : null,
      price_per_operation: form.pricePerOperation
        ? normalizeDecimal(form.pricePerOperation)
        : null,
    });
  };
  return (
    <>
      <Button view="action" size="l" onClick={() => setOpen(true)}>
        Создать операцию
      </Button>
      <Dialog open={open} onClose={close} onEnterKeyDown={submit} maxWidth="m" fullWidth>
        <Dialog.Header caption="Новая операция" />
        <Dialog.Body>
          <OperationForm
            value={form}
            onChange={setForm}
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

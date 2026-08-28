import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  operationKeys,
  operationToForm,
  OperationForm,
  updateOperation,
  validateOperationForm,
  type Operation,
  type OperationFormValue,
  type OperationUpdate,
} from '@/entities/Operation';
import {getErrorMessage} from '@/shared/api';
import {normalizeDecimal} from '@/shared/lib';

interface EditOperationButtonProps {
  operation: Operation;
}

export function EditOperationButton({operation}: EditOperationButtonProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OperationFormValue>(() =>
    operationToForm(operation),
  );
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: OperationUpdate) =>
      updateOperation(operation.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: operationKeys.all});
      setOpen(false);
    },
  });
  const openDialog = () => {
    setForm(operationToForm(operation));
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
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
      <Button view="flat" size="s" onClick={openDialog}>
        Изменить
      </Button>
      <Dialog open={open} onClose={close} onEnterKeyDown={submit} maxWidth="m" fullWidth>
        <Dialog.Header caption={`Редактировать: ${operation.name}`} />
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

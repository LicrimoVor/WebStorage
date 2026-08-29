import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createEmployee,
  employeeKeys,
  EmployeeForm,
  emptyEmployeeForm,
  validateEmployeeForm,
  type EmployeeCreate,
  type EmployeeFormValue,
} from '@/entities/Employee';
import {getErrorMessage} from '@/shared/api';

export function CreateEmployeeButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeFormValue>(emptyEmployeeForm);
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: EmployeeCreate) => createEmployee(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: employeeKeys.all});
      setOpen(false);
      setForm(emptyEmployeeForm);
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
    const error = validateEmployeeForm(form);
    if (error) {
      setValidationError(error);
      return;
    }
    mutation.mutate({
      full_name: form.fullName.trim(),
      compensation_type: form.compensationType,
      hourly_rate:
        form.compensationType === 'hourly'
          ? form.hourlyRate.replace(',', '.')
          : null,
      comment: form.comment.trim() || null,
    });
  };
  return (
    <>
      <Button view="action" size="l" onClick={() => setOpen(true)}>
        Добавить сотрудника
      </Button>
      <Dialog open={open} onClose={close} onEnterKeyDown={submit} maxWidth="m" fullWidth>
        <Dialog.Header caption="Новый сотрудник" />
        <Dialog.Body>
          <EmployeeForm
            value={form}
            onChange={setForm}
            error={
              validationError ??
              (mutation.error ? getErrorMessage(mutation.error) : undefined)
            }
          />
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Добавить"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
        />
      </Dialog>
    </>
  );
}

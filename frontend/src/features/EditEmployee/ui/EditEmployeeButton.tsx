import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  employeeKeys,
  employeeToForm,
  EmployeeForm,
  updateEmployee,
  validateEmployeeForm,
  type Employee,
  type EmployeeFormValue,
  type EmployeeUpdate,
} from '@/entities/Employee';
import {getErrorMessage} from '@/shared/api';

interface EditEmployeeButtonProps {
  employee: Employee;
}

export function EditEmployeeButton({employee}: EditEmployeeButtonProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeFormValue>(() =>
    employeeToForm(employee),
  );
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: EmployeeUpdate) => updateEmployee(employee.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: employeeKeys.all});
      setOpen(false);
    },
  });
  const openDialog = () => {
    setForm(employeeToForm(employee));
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };
  const close = () => !mutation.isPending && setOpen(false);
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
      <Button view="flat" size="s" onClick={openDialog}>
        Изменить
      </Button>
      <Dialog open={open} onClose={close} onEnterKeyDown={submit} maxWidth="m" fullWidth>
        <Dialog.Header caption={`Редактировать: ${employee.full_name}`} />
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

import { Button, Dialog } from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  archiveEmployee,
  employeeKeys,
  type Employee,
} from "@/entities/Employee";
import { getErrorMessage } from "@/shared/api";

interface ArchiveEmployeeButtonProps {
  employee: Employee;
}

export function ArchiveEmployeeButton({
  employee,
}: ArchiveEmployeeButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => archiveEmployee(employee.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      setOpen(false);
    },
  });
  if (!employee.active) return null;
  return (
    <>
      <Button view="flat-danger" size="s" onClick={() => setOpen(true)}>
        В архив
      </Button>
      <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)}>
        <Dialog.Header caption="Деактивировать сотрудника?" />
        <Dialog.Body>
          «{employee.full_name}» исчезнет из списка активного персонала, но
          останется доступен для будущей истории работ.
        </Dialog.Body>
        <Dialog.Footer
          preset="danger"
          textButtonApply="Деактивировать"
          textButtonCancel="Отмена"
          onClickButtonApply={() => mutation.mutate()}
          onClickButtonCancel={() => setOpen(false)}
          loading={mutation.isPending}
          errorText={mutation.error ? getErrorMessage(mutation.error) : ""}
          showError={Boolean(mutation.error)}
        />
      </Dialog>
    </>
  );
}

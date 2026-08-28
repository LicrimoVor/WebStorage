import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  archiveOperation,
  operationKeys,
  type Operation,
} from '@/entities/Operation';
import {getErrorMessage} from '@/shared/api';

interface ArchiveOperationButtonProps {
  operation: Operation;
}

export function ArchiveOperationButton({operation}: ArchiveOperationButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => archiveOperation(operation.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: operationKeys.all});
      setOpen(false);
    },
  });
  return (
    <>
      <Button view="flat-danger" size="s" onClick={() => setOpen(true)}>
        Архивировать
      </Button>
      <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)}>
        <Dialog.Header caption="Архивировать операцию?" />
        <Dialog.Body>
          «{operation.name}» исчезнет из рабочего списка и останется доступна для
          исторических связей.
        </Dialog.Body>
        <Dialog.Footer
          preset="danger"
          textButtonApply="Архивировать"
          textButtonCancel="Отмена"
          onClickButtonApply={() => mutation.mutate()}
          onClickButtonCancel={() => setOpen(false)}
          loading={mutation.isPending}
          errorText={mutation.error ? getErrorMessage(mutation.error) : ''}
          showError={Boolean(mutation.error)}
        />
      </Dialog>
    </>
  );
}

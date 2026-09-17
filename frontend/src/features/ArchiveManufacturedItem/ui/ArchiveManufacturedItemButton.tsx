import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  archiveManufacturedItem,
  manufacturedItemKeys,
  type ManufacturedItem,
} from '@/entities/ManufacturedItem';
import {getErrorMessage} from '@/shared/api';

interface ArchiveManufacturedItemButtonProps {
  item: ManufacturedItem;
}

export function ArchiveManufacturedItemButton({
  item,
}: ArchiveManufacturedItemButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const titleId = `archive-manufactured-item-${item.id}`;
  const mutation = useMutation({
    mutationFn: () => archiveManufacturedItem(item.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: manufacturedItemKeys.all});
      await queryClient.invalidateQueries({queryKey: ["stock-revision"]});
      setOpen(false);
    },
  });

  return (
    <>
      <Button view="flat-danger" size="s" onClick={() => setOpen(true)}>
        Архивировать
      </Button>
      <Dialog
        open={open}
        onClose={() => !mutation.isPending && setOpen(false)}
        aria-labelledby={titleId}
      >
        <Dialog.Header caption="Архивировать позицию?" id={titleId} />
        <Dialog.Body>
          «{item.name}» исчезнет из рабочего списка, но останется в складской
          истории.
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

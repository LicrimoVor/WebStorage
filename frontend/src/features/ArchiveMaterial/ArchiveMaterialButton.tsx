import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  archiveMaterial,
  materialKeys,
  type Material,
} from '@/entities/Material';
import {getErrorMessage} from '@/shared/api';

interface ArchiveMaterialButtonProps {
  material: Material;
}

export function ArchiveMaterialButton({material}: ArchiveMaterialButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const titleId = `archive-material-${material.id}`;
  const mutation = useMutation({
    mutationFn: () => archiveMaterial(material.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: materialKeys.all});
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
        <Dialog.Header caption="Архивировать материал?" id={titleId} />
        <Dialog.Body>
          «{material.name}» исчезнет из рабочего списка, но сохранится в складской истории.
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

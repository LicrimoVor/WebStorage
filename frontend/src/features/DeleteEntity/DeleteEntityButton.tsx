import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {useAuthSessionQuery} from '@/entities/Auth';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {isAdmin} from '@/shared/lib/access';

export function DeleteEntityButton({kind, id, name, onDeleted, label = 'Удалить'}: {
  kind: string; id: string; name: string; onDeleted?: () => void; label?: string;
}) {
  const session = useAuthSessionQuery();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement>();
  const mutation = useMutation({
    mutationFn: () => apiRequest(`/trash/${kind}/${id}`, {method: 'DELETE'}),
    onSuccess: async () => {
      setOpen(false);
      onDeleted?.();
      await client.invalidateQueries();
    },
  });
  if (!session.data || !isAdmin(session.data)) return null;
  return <>
    <Button view="flat-danger" onClick={(event) => {
      // Keep nested confirmation portals inside the parent's overlay so its
      // focus manager does not hide the confirmation from assistive technology.
      setContainer(event.currentTarget.closest<HTMLElement>('.g-modal') ?? undefined);
      mutation.reset();
      setOpen(true);
    }}>{label}</Button>
    <Dialog {...(container ? {container} : {})} open={open} onClose={() => !mutation.isPending && setOpen(false)}>
      <Dialog.Header caption="Переместить в корзину?" />
      <Dialog.Body>
        <p>«{name}» можно будет восстановить в настройках, в разделе «Корзина».</p>
        {kind === 'external_offer' && <p>Будет удалена привязка к исполнителю. Техкарта и история приходов сохранятся.</p>}
        {kind === 'finance_entry' && <p>Запись перестанет учитываться в финансовых итогах. Складские движения и производственная история сохранятся.</p>}
        {mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
      </Dialog.Body>
      <Dialog.Footer preset="danger" textButtonApply="Удалить" textButtonCancel="Отмена"
        onClickButtonApply={() => mutation.mutate()} onClickButtonCancel={() => setOpen(false)}
        loading={mutation.isPending} propsButtonCancel={{disabled: mutation.isPending}} />
    </Dialog>
  </>;
}

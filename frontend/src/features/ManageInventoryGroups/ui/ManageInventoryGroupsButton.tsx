import {Alert, Button, Dialog, Loader, Text, TextInput} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createInventoryGroup,
  deleteInventoryGroup,
  inventoryGroupKeys,
  updateInventoryGroup,
  useInventoryGroupsQuery,
} from '@/entities/InventoryGroup';
import {getErrorMessage} from '@/shared/api';

import styles from './ManageInventoryGroupsButton.module.scss';

export function ManageInventoryGroupsButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const queryClient = useQueryClient();
  const query = useInventoryGroupsQuery();
  const mutation = useMutation({
    mutationFn: async () => {
      const cleaned = name.trim();
      if (!cleaned) throw new Error('Введите название группы');
      if (editingId) return updateInventoryGroup(editingId, {name: cleaned});
      return createInventoryGroup({name: cleaned});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: inventoryGroupKeys.all});
      setName('');
      setEditingId(undefined);
    },
  });
  const removeMutation = useMutation({
    mutationFn: deleteInventoryGroup,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  const error = mutation.error ?? removeMutation.error;

  return (
    <>
      <Button view="outlined" size="l" onClick={() => setOpen(true)}>
        Группы
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="m" fullWidth>
        <Dialog.Header caption="Группы материалов и полуфабрикатов" />
        <Dialog.Body>
          <div className={styles.root}>
            <div className={styles.createRow}>
              <TextInput
                value={name}
                onUpdate={setName}
                label={editingId ? 'Новое название' : 'Название группы'}
                size="l"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') mutation.mutate();
                }}
              />
              <Button
                view="action"
                size="l"
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {editingId ? 'Сохранить' : 'Создать'}
              </Button>
              {editingId ? (
                <Button
                  size="l"
                  onClick={() => {
                    setEditingId(undefined);
                    setName('');
                  }}
                >
                  Отмена
                </Button>
              ) : null}
            </div>
            {error ? <Alert theme="danger" message={getErrorMessage(error)} /> : null}
            {query.isPending ? (
              <Loader />
            ) : query.isError ? (
              <Alert theme="danger" message={getErrorMessage(query.error)} />
            ) : query.data.length === 0 ? (
              <Text color="secondary">Групп пока нет.</Text>
            ) : (
              <div className={styles.list}>
                {query.data.map((group) => (
                  <div className={styles.group} key={group.id}>
                    <div>
                      <Text variant="subheader-2">{group.name}</Text>
                      <Text color="secondary" variant="body-1">
                        Материалов: {group.material_count}; полуфабрикатов:{' '}
                        {group.semi_finished_count}
                      </Text>
                    </div>
                    <div className={styles.actions}>
                      <Button
                        view="flat"
                        onClick={() => {
                          setEditingId(group.id);
                          setName(group.name);
                        }}
                      >
                        Переименовать
                      </Button>
                      <Button
                        view="flat-danger"
                        loading={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(group.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

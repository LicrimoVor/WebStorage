import {Alert, Button, Dialog, Select, TextInput} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {operationGroupKeys, operationGroupLabel, useOperationGroupsQuery} from './api';
import styles from '@/features/ManageInventoryGroups/ui/ManageInventoryGroupsButton.module.scss';

export function ManageOperationGroups() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [editing, setEditing] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const groups = useOperationGroupsQuery();
  const client = useQueryClient();
  const refresh = async () => {
    await client.invalidateQueries({queryKey: operationGroupKeys});
    await client.invalidateQueries({queryKey: ['operations']});
  };
  const save = useMutation({mutationFn: () => apiRequest(`/operation-groups${editing ? `/${editing}` : ''}`, {
    method: editing ? 'PATCH' : 'POST', body: JSON.stringify({name: name.trim(), parent_id: parentId || null}),
  }), onSuccess: async () => {setName(''); setParentId(''); setEditing(undefined); await refresh();}});
  const remove = useMutation({mutationFn: (id: string) => apiRequest(`/operation-groups/${id}`, {method: 'DELETE'}),
    onSuccess: async () => {setRemoving(undefined); setEditing(undefined); setParentId(''); setName(''); await refresh();}});
  return <>
    <Button size="l" view="outlined" onClick={() => setOpen(true)}>Группы операций</Button>
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="m" fullWidth>
      <Dialog.Header caption="Группы операций" />
      <Dialog.Body><div className={styles.root}>
        <p>Объединяйте операции по участкам или видам работ, например «Мехобработка» и «Сборка».</p>
        <form className={styles.createRow} onSubmit={(e) => {e.preventDefault(); if (name.trim() && !save.isPending) save.mutate();}}>
          <Select label="Родительская группа" aria-label="Родительская группа операций" width="max" size="l"
            value={[parentId]} onUpdate={(ids) => setParentId(ids[0] ?? '')}
            options={[{value: '', content: 'Без родителя — корневая группа'}, ...(groups.data ?? []).filter((g) => !g.parent_id && g.id !== editing).map((g) => ({value: g.id, content: g.name}))]} />
          <TextInput label="Название группы" value={name} onUpdate={setName} size="l" placeholder="Например, Мехобработка" controlProps={{'aria-label': 'Название группы операций', maxLength: 200}} />
          <div className={styles.actions}>
            <Button type="submit" view="action" loading={save.isPending} disabled={!name.trim()}>{editing ? 'Сохранить' : 'Создать группу'}</Button>
            {editing && <Button onClick={() => {setEditing(undefined); setName(''); setParentId('');}}>Отмена</Button>}
          </div>
        </form>
        {(save.error || remove.error || groups.error) && <Alert theme="danger" message={getErrorMessage(save.error ?? remove.error ?? groups.error)} />}
        {groups.data?.map((group) => <div className={styles.group} key={group.id}>
          <strong>{operationGroupLabel(group, groups.data ?? [])}</strong>
          <div className={styles.actions}>
            {!group.parent_id && <Button view="flat" onClick={() => {setEditing(undefined); setName(''); setParentId(group.id);}}>Добавить подгруппу</Button>}
            <Button view="flat" onClick={() => {setEditing(group.id); setName(group.name); setParentId(group.parent_id ?? '');}}>Изменить</Button>
            <Button view="flat-danger" onClick={() => setRemoving(group.id)}>Удалить</Button>
          </div>
          {removing === group.id && <div className={styles.confirm}>
            <p>Операции сохранятся в разделе «Без группы».</p>
            <Button view="outlined-danger" loading={remove.isPending} onClick={() => remove.mutate(group.id)}>Подтвердить удаление</Button>
            <Button onClick={() => setRemoving(undefined)}>Отмена</Button>
          </div>}
        </div>)}
      </div></Dialog.Body>
      <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setOpen(false)} />
    </Dialog>
  </>;
}

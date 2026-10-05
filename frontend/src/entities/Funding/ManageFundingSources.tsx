import {useAuthSessionQuery} from '@/entities/Auth';
import {isAdmin} from '@/shared/lib/access';
import {Alert, Button, Dialog, Icon} from '@gravity-ui/uikit';
import {Pencil, TrashBin, Plus} from '@gravity-ui/icons';
import {useState} from 'react';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {TextInput} from '@/shared/ui/FormControls';
import {useFundingSources, type FundingSource} from './api';
import styles from '@/pages/BusinessPages/BusinessPages.module.scss';

export function ManageFundingSources() {
  const session = useAuthSessionQuery();
  const admin = Boolean(session.data && isAdmin(session.data));
  const sources = useFundingSources();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<FundingSource>();
  const [removing, setRemoving] = useState<FundingSource>();
  const save = useMutation({mutationFn: () => apiRequest(`/funding-sources${editing ? `/${editing.id}` : ''}`, {
    method: editing ? 'PATCH' : 'POST', body: JSON.stringify({name: name.trim()}),
  }), onSuccess: async () => {setName(''); setEditing(undefined); await client.invalidateQueries({queryKey: ['funding-sources']});}});
  const remove = useMutation({mutationFn: () => apiRequest(`/funding-sources/${removing!.id}`, {method: 'DELETE'}),
    onSuccess: async () => {setRemoving(undefined); await client.invalidateQueries({queryKey: ['funding-sources']});}});
  return <section className={styles.form}>
    <h2>Источники финансирования</h2>
    <p>Добавьте счета или другие источники. Сумму одной операции можно распределить между несколькими источниками.</p>
    <form className={styles.row} onSubmit={(event) => {event.preventDefault(); if (name.trim() && !save.isPending) save.mutate();}}>
      <TextInput label="Название источника" placeholder="Например, расчётный счёт" value={name} onUpdate={setName} controlProps={{maxLength: 200}} />
      <Button type="submit" view="action" disabled={!name.trim()} loading={save.isPending}><Icon data={editing ? Pencil : Plus} />{editing ? 'Сохранить' : 'Создать источник'}</Button>
      {editing && <Button onClick={() => {setEditing(undefined); setName('');}}>Отмена</Button>}
    </form>
    {(save.error || sources.error) && <Alert theme="danger" message={getErrorMessage(save.error ?? sources.error)} />}
    {sources.data?.filter((source) => !source.archived).map((source) => <div className={styles.row} key={source.id}>
      <strong>{source.name}</strong>
      <Button view="flat" aria-label={`Изменить ${source.name}`} onClick={() => {setEditing(source); setName(source.name); save.reset();}}><Icon data={Pencil} />Изменить</Button>
      {admin && <Button view="flat-danger" onClick={() => {setRemoving(source); remove.reset();}}><Icon data={TrashBin} />Удалить</Button>}
    </div>)}
    <Dialog open={Boolean(removing)} onClose={() => setRemoving(undefined)} size="s">
      <Dialog.Header caption="Удалить источник?" />
      <Dialog.Body><p>«{removing?.name}» исчезнет из новых операций. Записи в истории сохранятся.</p>
        {remove.error && <Alert theme="danger" message={getErrorMessage(remove.error)} />}</Dialog.Body>
      <Dialog.Footer textButtonCancel="Отмена" textButtonApply="Удалить" loading={remove.isPending} onClickButtonCancel={() => setRemoving(undefined)} onClickButtonApply={() => remove.mutate()} />
    </Dialog>
  </section>;
}

import {PersonPlus, Pencil} from '@gravity-ui/icons';
import {Alert, Button, Checkbox, Dialog, Icon, TextInput} from '@gravity-ui/uikit';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {authKeys, useAuthSessionQuery} from '@/entities/Auth';
import {apiRequest, getErrorMessage} from '@/shared/api';
import type {components} from '@/shared/api/generated/schema';
import {sections} from '@/shared/lib/access';
import styles from './UsersPage.module.scss';

type User = components['schemas']['UserRead'];
type UserWrite = components['schemas']['UserWrite'];

function UserForm({user, onClose}: {user: User | null; onClose: () => void}) {
  const current = useAuthSessionQuery();
  const client = useQueryClient();
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [admin, setAdmin] = useState(user?.is_admin ?? false);
  const [active, setActive] = useState(user?.active ?? true);
  const [permissions, setPermissions] = useState<User['permissions']>(user?.permissions ?? []);
  const ownAccount = user?.username === current.data?.username;
  const mutation = useMutation({
    mutationFn: () => apiRequest<User>(user ? `/users/${user.id}` : '/users', {
      method: user ? 'PUT' : 'POST',
      body: JSON.stringify({username: username.trim(), password: password || null,
        is_admin: admin, active, permissions} satisfies UserWrite),
    }),
    onSuccess: async () => {
      if (ownAccount && (password || username !== user?.username)) {
        client.clear(); window.location.assign('/'); return;
      }
      await client.invalidateQueries({queryKey: ['users']});
      await client.invalidateQueries({queryKey: authKeys.session});
      onClose();
    },
  });
  const validName = /^[\p{L}\p{N}_.@+-]{3,100}$/u.test(username.trim());
  const validPassword = (!password && Boolean(user)) ||
    (password.length >= 12 && password.length <= 128 && Boolean(password.trim()) && password === confirmation);
  return <Dialog open onClose={() => !mutation.isPending && onClose()} size="m">
    <Dialog.Header caption={user ? 'Настроить пользователя' : 'Новый пользователь'} />
    <Dialog.Body><div className={styles.form}>
      <label className={styles.field}>Логин<TextInput value={username} onUpdate={setUsername} autoComplete="off" controlProps={{'aria-label': 'Логин пользователя', maxLength: 100}} /></label>
      <p>От 3 до 100 символов: буквы, цифры, _, точка, @, + и −.</p>
      <label className={styles.field}>{user ? 'Новый пароль (необязательно)' : 'Пароль'}<TextInput type="password" value={password} onUpdate={setPassword} autoComplete="new-password" controlProps={{'aria-label': 'Пароль пользователя', maxLength: 128}} /></label>
      <label className={styles.field}>Повтор пароля<TextInput type="password" value={confirmation} onUpdate={setConfirmation} autoComplete="new-password" controlProps={{'aria-label': 'Повтор пароля', maxLength: 128}} /></label>
      <p>От 12 до 128 символов. При изменении пароля или логина все сессии пользователя завершаются. Пустое поле при редактировании сохраняет пароль.</p>
      <Checkbox checked={active} onUpdate={setActive} disabled={ownAccount}>Учётная запись активна</Checkbox>
      <Checkbox checked={admin} onUpdate={setAdmin} disabled={ownAccount}>Администратор — доступ ко всем разделам и пользователям</Checkbox>
      <fieldset className={styles.permissions} disabled={admin}><legend>Доступ к разделам</legend>
        {sections.map((section) => <Checkbox key={section.id} checked={admin || permissions.includes(section.id)} onUpdate={(checked) => setPermissions(checked ? [...permissions, section.id] : permissions.filter((id) => id !== section.id))}>{section.title}</Checkbox>)}
      </fieldset>
      <p>Без выбранных разделов доступны только профиль и инструкция. Справочники для заполнения форм можно читать в пределах выданного раздела.</p>
      {mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
    </div></Dialog.Body>
    <Dialog.Footer textButtonApply="Сохранить" textButtonCancel="Отмена" onClickButtonApply={() => mutation.mutate()} onClickButtonCancel={onClose} loading={mutation.isPending} propsButtonApply={{disabled: !validName || !validPassword}} propsButtonCancel={{disabled: mutation.isPending}} />
  </Dialog>;
}

export function UsersPage() {
  const query = useQuery({queryKey: ['users'], queryFn: () => apiRequest<User[]>('/users')});
  const [editing, setEditing] = useState<User | null | undefined>();
  return <main className={styles.page}>
    <Link to="/settings">← Настройки</Link>
    <header><div><h1>Пользователи</h1><p>Учётные записи и доступ к разделам приложения.</p></div>
      <Button view="action" onClick={() => setEditing(null)}><Icon data={PersonPlus} />Добавить пользователя</Button></header>
    {query.isPending && <p>Загрузка пользователей…</p>}
    {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} />}
    <div className={styles.list}>{query.data?.map((user) => <article key={user.id} className={styles.card}>
      <div><h2>{user.username}</h2><p>{user.is_admin ? 'Администратор' : 'Пользователь'} · {user.active ? 'Активен' : 'Отключён'}</p>
        <p>{user.is_admin ? 'Все разделы' : sections.filter((s) => user.permissions.includes(s.id)).map((s) => s.title).join(', ') || 'Доступ к разделам не выдан'}</p>
        <p>Последний вход: {user.last_login_at ? new Date(user.last_login_at).toLocaleString('ru-RU') : 'ещё не входил'}</p></div>
      <Button onClick={() => setEditing(user)} aria-label={`Настроить ${user.username}`}><Icon data={Pencil} />Настроить</Button>
    </article>)}</div>
    {editing !== undefined && <UserForm user={editing} onClose={() => setEditing(undefined)} />}
  </main>;
}

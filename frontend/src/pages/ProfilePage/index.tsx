import {Person} from '@gravity-ui/icons';
import {Alert, Button, Icon, Label, Loader, TextInput} from '@gravity-ui/uikit';
import {useMutation} from '@tanstack/react-query';
import {useState, type FormEvent} from 'react';

import {changePassword, useAuthProfileQuery, type AuthProfile} from '@/entities/Auth';
import {getErrorMessage} from '@/shared/api';
import styles from './ProfilePage.module.scss';

const roleLabels: Record<AuthProfile['roles'][number], string> = {
  admin: 'Администратор',
  production: 'Производство',
  warehouse: 'Склад',
  manager: 'Менеджер',
  finance: 'Финансы',
};

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validation, setValidation] = useState('');
  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.reset();
    if (newPassword !== confirmation) {setValidation('Пароли не совпадают'); return;}
    if (newPassword.length < 8 || !newPassword.trim()) {
      setValidation('Новый пароль должен содержать не менее 8 символов'); return;
    }
    if (newPassword === currentPassword) {
      setValidation('Новый пароль должен отличаться от текущего'); return;
    }
    setValidation('');
    mutation.mutate({current_password: currentPassword, new_password: newPassword});
  };
  return <form className={styles.card} onSubmit={submit}>
    <h2>Смена пароля</h2>
    <p>После смены пароля другие сеансы будут завершены. На этом устройстве вход сохранится.</p>
    <TextInput type="password" label="Текущий пароль" value={currentPassword} onUpdate={setCurrentPassword}
      disabled={mutation.isPending} controlProps={{'aria-label': 'Текущий пароль', autoComplete: 'current-password', maxLength: 128, required: true}} />
    <TextInput type="password" label="Новый пароль" value={newPassword} onUpdate={setNewPassword}
      disabled={mutation.isPending} controlProps={{'aria-label': 'Новый пароль', autoComplete: 'new-password', maxLength: 128, required: true}} />
    <TextInput type="password" label="Повторите новый пароль" value={confirmation} onUpdate={setConfirmation}
      disabled={mutation.isPending} controlProps={{'aria-label': 'Повторите новый пароль', autoComplete: 'new-password', maxLength: 128, required: true}} />
    <p className={styles.secondary}>Не менее 8 символов.</p>
    {validation && <Alert theme="warning" message={validation} />}
    {mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
    {mutation.isSuccess && <Alert theme="success" message="Пароль изменён" />}
    <Button type="submit" view="action" loading={mutation.isPending}
      disabled={!currentPassword || !newPassword || !confirmation}>Изменить пароль</Button>
  </form>;
}

export function ProfilePage() {
  const profile = useAuthProfileQuery();
  return <main className={styles.page}>
    <h1>Профиль пользователя</h1>
    {profile.isPending && <Loader />}
    {profile.isError && <Alert theme="danger" message={getErrorMessage(profile.error)} />}
    {profile.data && <>
      <section className={styles.card}>
        <div className={styles.identity}>
          <div className={styles.avatar}><Icon data={Person} size={32} /></div>
          <div><p className={styles.secondary}>Логин</p><h2>{profile.data.username}</h2></div>
        </div>
        <div className={styles.roles} aria-label="Роли пользователя">
          {profile.data.roles.map((role) => <Label key={role}>{roleLabels[role]}</Label>)}
        </div>
        <dl className={styles.metadata}>
          <div><dt>Учётная запись создана</dt><dd>{profile.data.created_at ? new Date(profile.data.created_at).toLocaleDateString() : '—'}</dd></div>
          <div><dt>Последний вход</dt><dd>{profile.data.last_login_at ? new Date(profile.data.last_login_at).toLocaleString() : '—'}</dd></div>
        </dl>
      </section>
      {profile.data.can_change_password ? <PasswordForm /> : <Alert theme="info" message="Вход по паролю отключён. Смена пароля недоступна." />}
    </>}
  </main>;
}

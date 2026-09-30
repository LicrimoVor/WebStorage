import {Alert, Button} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {appearanceKey, palettes, useAppearance, type Appearance, type Palette} from '@/entities/Auth/appearance';
import {apiRequest, getErrorMessage} from '@/shared/api';
import styles from './BusinessPages.module.scss';
import local from './AppearanceSettings.module.scss';

const labels: Record<keyof Palette, string> = {accent: 'Основной цвет', link: 'Ссылки и акценты текста', background: 'Фон приложения', surface: 'Фон панелей и окон'};
export function AppearanceSettings({username}: {username: string}) {
  const query = useAppearance(username);
  const client = useQueryClient();
  const [draft, setDraft] = useState<Appearance>();
  const value = draft ?? query.data ?? {light: null, dark: null};
  const mutation = useMutation({mutationFn: (settings: Appearance) => apiRequest<Appearance>('/auth/appearance', {method: 'PUT', body: JSON.stringify(settings)}), onSuccess: (saved) => {client.setQueryData(appearanceKey(username), saved); setDraft(undefined);}});
  return <section className={styles.form}>
    <h2>Цвета интерфейса</h2>
    <p>Личные цвета для светлой и тёмной темы. Сохраняются в вашей учётной записи и применяются после входа на любом устройстве.</p>
    {query.isPending ? <p role="status">Загрузка настроек…</p> : <div className={local.palettes}>
      {(['light', 'dark'] as const).map((theme) => <fieldset key={theme} disabled={mutation.isPending || query.isError}>
        <legend>{theme === 'light' ? 'Светлая тема' : 'Тёмная тема'}</legend>
        {(Object.keys(labels) as (keyof Palette)[]).map((key) => <label key={key}>
          <span>{labels[key]}</span><input type="color" aria-label={`${theme === 'light' ? 'Светлая' : 'Тёмная'}: ${labels[key]}`} value={(value[theme] ?? palettes[theme])[key]} onChange={(event) => {mutation.reset(); setDraft({...value, [theme]: {...(value[theme] ?? palettes[theme]), [key]: event.target.value}});}} />
          <code>{(value[theme] ?? palettes[theme])[key]}</code>
        </label>)}
      </fieldset>)}
    </div>}
    {(query.error || mutation.error) && <Alert theme="danger" message={getErrorMessage(query.error ?? mutation.error)} />}
    {mutation.isSuccess && !draft && <Alert theme="success" message="Цвета сохранены" />}
    <div className={styles.row}>
      <Button view="action" disabled={!draft || query.isError} loading={mutation.isPending} onClick={() => mutation.mutate(value)}>Сохранить цвета</Button>
      <Button disabled={mutation.isPending || query.isPending || query.isError} onClick={() => mutation.mutate({light: null, dark: null})}>Стандартные цвета</Button>
    </div>
  </section>;
}

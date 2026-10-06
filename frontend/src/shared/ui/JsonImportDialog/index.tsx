import {ArrowUpFromLine} from '@gravity-ui/icons';
import {Alert, Button, Dialog, Icon} from '@gravity-ui/uikit';
import {useState, type ReactNode} from 'react';

import {TextArea} from '@/shared/ui/FormControls';
import styles from './JsonImportDialog.module.scss';

export function JsonImportButton({onClick, disabled = false}: {onClick: () => void; disabled?: boolean}) {
  return <Button disabled={disabled} onClick={onClick}><Icon data={ArrowUpFromLine} />Импорт JSON</Button>;
}

interface JsonImportDialogProps {
  open: boolean;
  title: string;
  source: string;
  onUpdate: (source: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  example: string;
  prompt: string;
  description: ReactNode;
  formatDescription?: ReactNode;
  error?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  applyText?: string;
  inputLabel?: string;
  maxBytes?: number;
}

export function JsonImportDialog({open, title, source, onUpdate, onClose, onSubmit, example, prompt,
  description, formatDescription, error, busy = false, disabled = false,
  applyText = 'Импортировать', inputLabel = 'JSON для импорта', maxBytes = 1024 * 1024}: JsonImportDialogProps) {
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const pending = busy || reading;
  const close = () => {
    if (pending) return;
    setFileError(''); setCopyStatus(''); onClose();
  };
  const copy = async () => {
    try {await navigator.clipboard.writeText(prompt); setCopyStatus('Промпт скопирован');}
    catch {setCopyStatus('Не удалось скопировать. Выделите текст промпта и скопируйте вручную.');}
  };
  return <Dialog open={open} onClose={close} size="l">
    <Dialog.Header caption={title} />
    <Dialog.Body><div className={styles.body}>
      <div>{description}</div>
      <details className={styles.format}>
        <summary>Формат JSON и пример</summary>
        {formatDescription}
        <pre aria-label="Формат JSON">{example}</pre>
        <Button disabled={pending || disabled} onClick={() => {onUpdate(example); setFileError('');}}>Вставить пример в поле</Button>
        <div className={styles.prompt}>
          <TextArea label="Промпт для ИИ" value={prompt} readOnly rows={12} />
          <Button onClick={() => void copy()}>Скопировать промпт</Button>
          {copyStatus && <Alert theme="info" message={copyStatus} />}
        </div>
      </details>
      <label>Файл JSON<input type="file" aria-label="Файл JSON" accept=".json,application/json"
        disabled={pending || disabled} onChange={async (event) => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
          if (!file) return;
          setFileError('');
          if (file.size > maxBytes) {setFileError(`Размер файла не должен превышать ${maxBytes / 1024 / 1024} МБ.`); return;}
          setReading(true);
          try {onUpdate((await file.text()).replace(/^\uFEFF/, ''));}
          catch {setFileError('Не удалось прочитать файл.');}
          finally {setReading(false);}
        }} /></label>
      <TextArea controlProps={{'aria-label': inputLabel}} placeholder="Вставьте JSON или загрузите файл"
        value={source} onUpdate={(value) => {setFileError(''); onUpdate(value);}} minRows={12} disabled={pending || disabled} />
      {fileError && <Alert theme="danger" message={fileError} />}
      {error}
    </div></Dialog.Body>
    <Dialog.Footer textButtonCancel="Отмена" textButtonApply={applyText} onClickButtonCancel={close}
      onClickButtonApply={() => {
        if (new Blob([source]).size > maxBytes) {setFileError(`Размер JSON не должен превышать ${maxBytes / 1024 / 1024} МБ.`); return;}
        setFileError(''); onSubmit();
      }} propsButtonApply={{loading: pending, disabled: !source.trim() || pending || disabled}}
      propsButtonCancel={{disabled: pending}} />
  </Dialog>;
}

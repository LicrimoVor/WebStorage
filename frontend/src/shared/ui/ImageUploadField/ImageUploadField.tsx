import {Button, Dialog, Loader, Text, TextInput} from '@gravity-ui/uikit';
import {useMutation} from '@tanstack/react-query';
import {useRef, useState, type ChangeEvent} from 'react';

import {getErrorMessage, uploadImage} from '@/shared/api';

import styles from './ImageUploadField.module.scss';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface ImageUploadFieldProps {
  value: string;
  onUpdate: (value: string) => void;
  alt: string;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function ImageUploadField({value, onUpdate, alt}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: async (file: File) =>
      uploadImage({
        filename: file.name,
        content_type: file.type,
        content_base64: bytesToBase64(await file.arrayBuffer()),
      }),
    onSuccess: (image) => {
      setLocalError(undefined);
      onUpdate(image.url);
    },
  });
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      mutation.reset();
      setLocalError('Файл превышает допустимый размер 5 МБ');
      return;
    }
    setLocalError(undefined);
    mutation.mutate(file);
  };

  return (
    <div className={styles.root}>
      <TextInput
        label="Ссылка на изображение"
        value={value}
        onUpdate={onUpdate}
        placeholder="https://… или загрузите файл ниже"
        controlProps={{'aria-label': 'Ссылка на изображение'}}
      />
      <div className={styles.heading}>
        <div>
          <Text variant="subheader-2">Изображение</Text>
          <Text as="div" color="secondary" variant="caption-2">
            PNG, JPEG, GIF или WebP, до 5 МБ
          </Text>
        </div>
        <div className={styles.actions}>
          <input
            ref={inputRef}
            className={styles.fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={onFileChange}
            aria-label="Выбрать изображение"
          />
          <Button
            view="outlined"
            onClick={() => inputRef.current?.click()}
            disabled={mutation.isPending}
          >
            {value ? 'Заменить' : 'Загрузить'}
          </Button>
          {value ? (
            <Button view="flat-danger" onClick={() => onUpdate('')}>
              Удалить
            </Button>
          ) : null}
        </div>
      </div>
      {mutation.isPending ? (
        <div className={styles.state}>
          <Loader size="s" /> Загрузка изображения…
        </div>
      ) : null}
      {localError || mutation.error ? (
        <Text color="danger" variant="caption-2">
          {localError ?? getErrorMessage(mutation.error)}
        </Text>
      ) : null}
      {value ? (
        <button
          className={styles.previewButton}
          type="button"
          onClick={() => setPreviewOpen(true)}
          aria-label="Увеличить изображение"
        >
          <img className={styles.preview} src={value} alt={alt} />
        </button>
      ) : null}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} size="l">
        <Dialog.Header caption="Просмотр изображения" />
        <Dialog.Body>
          {value ? <img className={styles.fullImage} src={value} alt={alt} /> : null}
        </Dialog.Body>
      </Dialog>
    </div>
  );
}

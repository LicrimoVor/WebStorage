import {TextInput} from '@/shared/ui/FormControls';
import {Button, Dialog, Loader, Text} from '@gravity-ui/uikit';
import {useMutation} from '@tanstack/react-query';
import {useEffect, useRef, useState, type ChangeEvent} from 'react';

import {getErrorMessage, uploadImage} from '@/shared/api';

import styles from './ImageUploadField.module.scss';
import {ImageCropDialog} from './ImageCropDialog';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface ImageUploadFieldProps {
  value: string;
  onUpdate: (value: string) => void;
  alt: string;
  onBusyChange?: ((busy: boolean) => void) | undefined;
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

export function ImageUploadField({value, onUpdate, alt, onBusyChange}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [link, setLink] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [preview, setPreview] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const storedLink = useRef(value);
  const mutation = useMutation({
    mutationFn: async (source: File | string) => {
      let file: File;
      if (typeof source === 'string') {
        abortRef.current = new AbortController();
        const response = await fetch(source, {
          signal: AbortSignal.any([abortRef.current.signal, AbortSignal.timeout(30_000)]),
          credentials: 'omit',
        });
        if (!response.ok) throw new Error('Не удалось скачать изображение по ссылке');
        if (Number(response.headers.get('Content-Length')) > MAX_IMAGE_BYTES) {
          throw new Error('Файл превышает допустимый размер 5 МБ');
        }
        const blob = await response.blob();
        const extension = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp'}[blob.type];
        if (!extension) throw new Error('По ссылке должен находиться файл PNG, JPEG, GIF или WebP');
        file = new File([blob], `image.${extension}`, {type: blob.type});
      } else {
        file = source;
      }
      if (file.size > MAX_IMAGE_BYTES) throw new Error('Файл превышает допустимый размер 5 МБ');
      if (!mounted.current) throw new Error('Загрузка отменена');
      if (typeof URL.createObjectURL === 'function') setPreview(URL.createObjectURL(file));
      return uploadImage({
        filename: file.name,
        content_type: file.type,
        content_base64: bytesToBase64(await file.arrayBuffer()),
      });
    },
    onSuccess: (image) => {
      if (!mounted.current) return;
      setLocalError(undefined);
      onUpdate(image.url);
      storedLink.current = image.url;
      setLink(image.url);
      setPreview('');
      setCropOpen(false);
    },
    onError: (error) => {
      if (mounted.current) setLocalError(error instanceof TypeError
        ? 'Браузер не смог скачать изображение. Проверьте ссылку; если сайт запрещает скачивание (CORS), загрузите файл вручную.'
        : error.message);
    },
  });
  const {mutate} = mutation;
  const busy = mutation.isPending || (link.trim() !== '' && link !== value);
  useEffect(() => {onBusyChange?.(busy);}, [busy, onBusyChange]);
  if (lastValue !== value) {
    setLastValue(value);
    setLink(value);
  }
  useEffect(() => () => {if (preview) URL.revokeObjectURL(preview);}, [preview]);
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false; abortRef.current?.abort(); onBusyChange?.(false);};
  }, [onBusyChange]);
  useEffect(() => {
    if (!link.trim() || link === value || link === storedLink.current) return;
    const timer = window.setTimeout(() => {
      try {
        const url = new URL(link);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
        setLocalError(undefined);
        mutate(link);
      } catch {
        setLocalError('Введите полную ссылку на изображение (https://…)');
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [link, value, mutate]);
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
        value={link}
        disabled={mutation.isPending}
        onUpdate={(next) => {mutation.reset(); setLocalError(undefined); setLink(next); if (!next.trim()) onUpdate('');}}
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
          {link !== value && !mutation.isPending && <>
            {localError && <Button onClick={() => {setLocalError(undefined); mutation.mutate(link);}}>Повторить загрузку</Button>}
            <Button onClick={() => {setLink(value); setPreview(''); setLocalError(undefined); mutation.reset();}}>Отменить ссылку</Button>
          </>}
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
            <Button view="outlined" disabled={mutation.isPending} onClick={() => {mutation.reset(); setCropOpen(true);}}>
              Обрезать
            </Button>
          ) : null}
          {value ? (
            <Button view="flat-danger" disabled={mutation.isPending} onClick={() => {setLink(''); setPreview(''); onUpdate('');}}>
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
      {preview || value ? (
        <button
          className={styles.previewButton}
          type="button"
          onClick={() => setPreviewOpen(true)}
          aria-label="Увеличить изображение"
        >
          <img className={styles.preview} src={preview || value} alt={alt} />
        </button>
      ) : null}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} size="l">
        <Dialog.Header caption="Просмотр изображения" />
        <Dialog.Body>
          {preview || value ? <img className={styles.fullImage} src={preview || value} alt={alt} /> : null}
        </Dialog.Body>
      </Dialog>
      {cropOpen && <ImageCropDialog src={value} alt={alt} pending={mutation.isPending}
        error={mutation.error ? getErrorMessage(mutation.error) : undefined}
        onClose={() => setCropOpen(false)} onApply={(file) => mutation.mutate(file)} />}
    </div>
  );
}

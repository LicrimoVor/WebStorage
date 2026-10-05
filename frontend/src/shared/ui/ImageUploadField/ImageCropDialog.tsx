import {Alert, Button, Dialog} from '@gravity-ui/uikit';
import {useRef, useState, type PointerEvent} from 'react';
import styles from './ImageUploadField.module.scss';

interface Crop {x: number; y: number; width: number; height: number}

export function ImageCropDialog({src, alt, onClose, onApply, pending, error}: {
  src: string; alt: string; onClose: () => void;
  onApply: (file: File) => void; pending: boolean; error?: string | undefined;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{x: number; y: number; crop: Crop} | null>(null);
  const [crop, setCrop] = useState<Crop>({x: 0, y: 0, width: 100, height: 100});
  const [loaded, setLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [localError, setLocalError] = useState<string>();
  const [encoding, setEncoding] = useState(false);
  const busy = pending || encoding;
  const moveCrop = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || busy) return;
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const start = drag.current;
    setCrop({...start.crop,
      x: Math.max(0, Math.min(100 - start.crop.width, start.crop.x + (event.clientX - start.x) / bounds.width * 100)),
      y: Math.max(0, Math.min(100 - start.crop.height, start.crop.y + (event.clientY - start.y) / bounds.height * 100)),
    });
  };
  const apply = async () => {
    const img = imageRef.current;
    if (!img || !loaded) return;
    setEncoding(true);
    setLocalError(undefined);
    try {
      const sx = Math.floor(img.naturalWidth * crop.x / 100);
      const sy = Math.floor(img.naturalHeight * crop.y / 100);
      const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(img.naturalWidth * crop.width / 100)));
      const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(img.naturalHeight * crop.height / 100)));
      const scale = Math.min(1, 2048 / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не удалось открыть редактор изображения.');
      context.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Не удалось сохранить изображение.')),
        'image/png',
      ));
      if (blob.size > 5 * 1024 * 1024) throw new Error('Изображение превышает 5 МБ. Уменьшите область обрезки.');
      onApply(new File([blob], 'cropped-image.png', {type: 'image/png'}));
    } catch (cause) {
      setLocalError(cause instanceof DOMException && cause.name === 'SecurityError'
        ? 'Сайт изображения запрещает обрезку. Загрузите изображение файлом и повторите.'
        : cause instanceof Error ? cause.message : 'Не удалось обрезать изображение.');
    } finally {
      setEncoding(false);
    }
  };
  return <Dialog open size="l" onClose={() => !busy && onClose()}>
    <Dialog.Header caption="Обрезать изображение" />
    <Dialog.Body>
      <div className={styles.root}>
        <p>Задайте размер области и перетащите рамку на нужную часть изображения.</p>
        <div className={styles.cropStage} style={{width: `min(100%, ${50 * aspectRatio}vh)`}}>
          <img ref={imageRef} className={styles.cropImage} src={src} alt={alt} crossOrigin="anonymous"
            onLoad={(event) => {
              const img = event.currentTarget;
              setAspectRatio(img.naturalWidth / Math.max(1, img.naturalHeight));
              setLoaded(true);
              setLocalError(undefined);
            }}
            onError={() => {setLoaded(false); setLocalError('Не удалось загрузить изображение для обрезки. Для внешней ссылки попробуйте загрузить изображение файлом.');}} />
          {loaded && <div className={styles.cropSelection} style={{left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%`}}
            onPointerDown={(event) => {
              if (busy) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {x: event.clientX, y: event.clientY, crop};
            }} onPointerMove={moveCrop} onPointerUp={() => {drag.current = null;}} onPointerCancel={() => {drag.current = null;}} />}
        </div>
        <div className={styles.cropControls}>
          {(['width', 'height', 'x', 'y'] as const).map((field) => {
            const label = {width: 'Ширина области', height: 'Высота области', x: 'Сдвиг по горизонтали', y: 'Сдвиг по вертикали'}[field];
            const max = field === 'x' ? 100 - crop.width : field === 'y' ? 100 - crop.height : 100;
            return <label key={field}>{label}: {Math.round(crop[field])}%
              <input type="range" aria-label={label} min={field === 'width' || field === 'height' ? 1 : 0}
                max={max} value={crop[field]} disabled={!loaded || busy} onChange={(event) => {
                  const next = {...crop, [field]: Number(event.target.value)};
                  next.x = Math.min(next.x, 100 - next.width);
                  next.y = Math.min(next.y, 100 - next.height);
                  setCrop(next);
                }} />
            </label>;
          })}
        </div>
        {(localError || error) && <Alert theme="danger" message={localError ?? error} />}
        <Button disabled={busy} onClick={() => setCrop({x: 0, y: 0, width: 100, height: 100})}>Сбросить область</Button>
      </div>
    </Dialog.Body>
    <Dialog.Footer textButtonApply="Применить обрезку" textButtonCancel="Отмена" onClickButtonApply={() => void apply()}
      onClickButtonCancel={onClose} loading={busy} propsButtonApply={{disabled: !loaded || busy}} propsButtonCancel={{disabled: busy}} />
  </Dialog>;
}

import {Picture, Xmark} from '@gravity-ui/icons';
import {Button, Icon} from '@gravity-ui/uikit';
import {useState, type ReactNode} from 'react';
import styles from './DetailCard.module.scss';

export function DetailCardImage({image, name}: {image: string | null; name: string}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return image && image !== failedUrl
    ? <img decoding="async" src={image} alt={name} className={styles.image} onError={() => setFailedUrl(image)} />
    : <div className={styles.imagePlaceholder} aria-label="Нет изображения"><Icon data={Picture} size={48} /></div>;
}

export function DetailCardFooter({onClose, children}: {onClose: () => void; children?: ReactNode}) {
  return <footer className={styles.footer}>
    {children && <div className={styles.actions}>{children}</div>}
    <Button size="l" view="normal" onClick={onClose}><Icon data={Xmark} />Закрыть</Button>
  </footer>;
}

export function DetailCardMetrics({items}: {items: {label: string; value: string; unit?: string; warning?: boolean}[]}) {
  return <dl className={styles.metrics}>{items.map((item) => <div key={item.label} className={item.warning ? styles.warning : undefined}>
    <dt>{item.label}</dt><dd>{item.value}{item.unit && <small>{item.unit}</small>}</dd>
  </div>)}</dl>;
}

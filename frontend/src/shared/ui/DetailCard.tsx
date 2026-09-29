import {Ellipsis, Xmark} from '@gravity-ui/icons';
import {Button, Icon, Popup} from '@gravity-ui/uikit';
import {useId, useState, type ReactNode} from 'react';
import styles from './DetailCard.module.scss';

export function DetailCardFooter({onClose, children}: {onClose: () => void; children?: ReactNode}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const id = useId();
  return <footer className={styles.footer}>
    {children && <>
      <Button ref={setAnchor} size="l" view="outlined" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        <Icon data={Ellipsis} />Действия
      </Button>
      <Popup id={id} open={open} onOpenChange={setOpen} anchorElement={anchor} placement="top-start" keepMounted disablePortal>
        <div className={styles.actions}>{children}</div>
      </Popup>
    </>}
    <Button size="l" view="normal" onClick={onClose}><Icon data={Xmark} />Закрыть</Button>
  </footer>;
}

export function DetailCardMetrics({items}: {items: {label: string; value: string; unit?: string; warning?: boolean}[]}) {
  return <dl className={styles.metrics}>{items.map((item) => <div key={item.label} className={item.warning ? styles.warning : undefined}>
    <dt>{item.label}</dt><dd>{item.value}{item.unit && <small>{item.unit}</small>}</dd>
  </div>)}</dl>;
}

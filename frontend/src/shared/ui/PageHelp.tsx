import {CircleExclamation} from '@gravity-ui/icons';
import {Button, Dialog, Icon} from '@gravity-ui/uikit';
import {useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {chapterForPath} from '@/shared/lib/help/chapters';

export function PageHelp({path}: {path?: string}) {
  const location = useLocation();
  const chapter = chapterForPath(path ?? location.pathname);
  const [openedAt, setOpenedAt] = useState<string>();
  return <>
    <Button view="flat" aria-label="О странице" title="Для чего и как пользоваться этой страницей" onClick={() => setOpenedAt(location.key)}><Icon data={CircleExclamation} size={20} /></Button>
    <Dialog open={openedAt === location.key} onClose={() => setOpenedAt(undefined)} size="m">
      <Dialog.Header caption={chapter.title} />
      <Dialog.Body><h3>Для чего</h3><p>{chapter.purpose}</p><h3>Когда пользоваться</h3><p>{chapter.when}</p>
        <h3>Как пользоваться</h3><ol>{chapter.steps.map((step) => <li key={step} style={{marginBlock: 8, lineHeight: 1.6}}>{step}</li>)}</ol>
        <p>{chapter.result}</p><Button component={Link} to={`/help/${chapter.id}`} onClick={() => setOpenedAt(undefined)}>Открыть главу инструкции</Button>
      </Dialog.Body>
      <Dialog.Footer textButtonCancel="Понятно" onClickButtonCancel={() => setOpenedAt(undefined)} />
    </Dialog>
  </>;
}

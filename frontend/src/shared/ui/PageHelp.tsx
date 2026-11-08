import {CircleExclamation} from '@gravity-ui/icons';
import {Button, Icon} from '@gravity-ui/uikit';
import {lazy, Suspense, useState} from 'react';
import {useLocation} from 'react-router-dom';

const PageHelpDialog = lazy(() => import('./PageHelpDialog'));

export function PageHelp({path}: {path?: string}) {
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState<string>();
  return <>
    <Button view="flat" aria-label="О странице" title="Для чего и как пользоваться этой страницей" onClick={() => setOpenedAt(location.key)}><Icon data={CircleExclamation} size={20} /></Button>
    {openedAt === location.key && <Suspense fallback={<span role="status">Загрузка справки…</span>}>
      <PageHelpDialog path={path ?? location.pathname} onClose={() => setOpenedAt(undefined)} />
    </Suspense>}
  </>;
}

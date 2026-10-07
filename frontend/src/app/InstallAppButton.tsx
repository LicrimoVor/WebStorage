import {ArrowDownToSquare} from '@gravity-ui/icons';
import {Button, Icon} from '@gravity-ui/uikit';
import {useSyncExternalStore} from 'react';

import {clearInstallPrompt, getInstallPrompt, subscribe} from './installPrompt';

export function InstallAppButton() {
  const event = useSyncExternalStore(subscribe, getInstallPrompt, () => null);
  if (!event) return null;
  return <Button view="flat" aria-label="Установить приложение" title="Установить приложение"
    onClick={() => {
      clearInstallPrompt();
      void event.prompt().catch(() => undefined);
    }}><Icon data={ArrowDownToSquare} size={18} /></Button>;
}

import {registerInstallPrompt} from '@/app/installPrompt';
import '@gravity-ui/uikit/styles/styles.css';
import '@/app/styles/global.scss';

import {configure} from '@gravity-ui/uikit';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import {App} from '@/app/App';
import {registerServiceWorker} from '@/app/registerServiceWorker';

configure({lang: 'ru'});
registerInstallPrompt();
registerServiceWorker();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

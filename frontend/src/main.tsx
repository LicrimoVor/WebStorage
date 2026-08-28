import '@gravity-ui/uikit/styles/fonts.css';
import '@gravity-ui/uikit/styles/styles.css';
import '@/app/styles/global.scss';

import {configure} from '@gravity-ui/uikit';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import {App} from '@/app/App';

configure({lang: 'ru'});

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


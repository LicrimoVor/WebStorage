import '@testing-library/jest-dom/vitest';

import {configure} from '@gravity-ui/uikit';
import {afterEach} from 'vitest';
import {cleanup} from '@testing-library/react';

configure({lang: 'ru'});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

afterEach(() => cleanup());


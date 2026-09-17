/// <reference types="node" />
import {readFileSync} from 'node:fs';

import {renderHook} from '@testing-library/react';
import {afterEach, expect, it} from 'vitest';

import {usePageMetadata} from './usePageMetadata';

const originalHead = document.head.innerHTML;
afterEach(() => { document.head.innerHTML = originalHead; });

it('ships noindex before JavaScript executes and lets crawlers read it', () => {
  const html = readFileSync('index.html', 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  expect(parsed.documentElement.lang).toBe('ru');
  expect(parsed.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  expect(parsed.querySelector('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
  expect(parsed.querySelector('title')?.textContent).toContain('Веб-склад');
  expect(readFileSync('public/robots.txt', 'utf8')).toMatch(/^Allow: \/$/m);
});

it('updates metadata on navigation without duplicate tags or removing noindex', () => {
  const {rerender} = renderHook(({title, description}) => usePageMetadata(title, description), {
    initialProps: {title: 'Склад', description: 'Остатки материалов'},
  });
  rerender({title: 'Персонал', description: 'Сотрудники'});
  expect(document.title).toBe('Персонал — Веб-склад');
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    expect(document.head.querySelectorAll(selector)).toHaveLength(1);
    expect(document.head.querySelector(selector)?.getAttribute('content')).toBe('Сотрудники');
  }
  expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
});

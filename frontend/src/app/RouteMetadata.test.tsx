import {render} from '@testing-library/react';
import {afterEach, expect, it} from 'vitest';
import {RouteMetadata} from './RouteMetadata';

const originalHead = document.head.innerHTML;
afterEach(() => {document.head.innerHTML = originalHead;});

it('updates metadata for planning tabs and keeps indexing disabled', () => {
  const {rerender} = render(<RouteMetadata pathname="/production-plans" search="" />);
  expect(document.title).toBe('Планирование производства — Веб-склад');
  rerender(<RouteMetadata pathname="/production-plans" search="?tab=release" />);
  expect(document.title).toBe('Выпуск продукции — Веб-склад');
  rerender(<RouteMetadata pathname="/production-plans" search="?tab=stock" />);
  expect(document.title).toBe('Склад готовой продукции — Веб-склад');
  expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
});

it.each(['/warehouse-extra', '/warehouse/missing', '/processes/id/extra', '/helpful', '/missing/instruction'])(
  'uses missing page metadata for an unmatched route %s', (pathname) => {
    render(<RouteMetadata pathname={pathname} search="" />);
    expect(document.title).toBe('Страница не найдена — Веб-склад');
  },
);

it('recognizes a dynamic instruction route and trailing slash', () => {
  const {rerender} = render(<RouteMetadata pathname="/operations/id/instruction" search="" />);
  expect(document.title).toBe('Техническая инструкция — Веб-склад');
  rerender(<RouteMetadata pathname="/warehouse/" search="" />);
  expect(document.title).toBe('Склад — Веб-склад');
});

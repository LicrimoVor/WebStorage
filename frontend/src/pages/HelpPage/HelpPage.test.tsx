import {screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Route, Routes} from 'react-router-dom';
import {RouteMetadata} from '@/app/RouteMetadata';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {HelpPage} from './HelpPage';

const originalHead = document.head.innerHTML;
beforeEach(() => {vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);});
afterEach(() => {vi.restoreAllMocks(); document.head.innerHTML = originalHead;});

it('keeps chapter metadata when the authenticated layout mounts', () => {
  renderWithProviders(<>
    <RouteMetadata pathname="/help/planning" search="" />
    <Routes><Route path="/help/:chapterId?" element={<HelpPage />} /></Routes>
  </>, '/help/planning');
  expect(document.title).toBe('Планирование и выпуск · Инструкция — Веб-склад');
  expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('План задаёт');
});

it('explains an unknown chapter instead of showing the first chapter', () => {
  renderWithProviders(<Routes>
    <Route path="/help/:chapterId?" element={<HelpPage />} />
  </Routes>, '/help/missing');
  expect(screen.getByRole('heading', {name: 'Глава не найдена'})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Открыть инструкцию'})).toHaveAttribute('href', '/help');
  expect(document.title).toBe('Глава не найдена — Веб-склад');
});

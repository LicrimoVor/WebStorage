import {render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';

import {ErrorBoundary} from './ErrorBoundary';

it('shows a recovery action when a page crashes', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  function BrokenPage(): never { throw new Error('Chunk failed'); }
  try {
    render(<ErrorBoundary><BrokenPage /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось открыть страницу');
    expect(screen.getByRole('button', {name: 'Обновить страницу'})).toBeVisible();
  } finally {
    log.mockRestore();
  }
});

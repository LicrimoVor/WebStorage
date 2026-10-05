import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {TrashPage} from './TrashPage';

vi.mock('@/shared/api', () => ({apiRequest: vi.fn(), getErrorMessage: () => 'Не удалось восстановить'}));

describe('TrashPage', () => {
  it('restores a deleted record and refreshes the trash', async () => {
    let deleted = true;
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/trash/deleted/restore') {deleted = false; return undefined;}
      return {total: deleted ? 1 : 0, items: deleted ? [{
        id: 'deleted', entity_type: 'material', name: 'Сталь', deleted_by: 'admin',
        deleted_at: '2026-10-05T09:00:00Z',
      }] : []};
    });
    renderWithProviders(<TrashPage />);
    expect(await screen.findByText('Сталь')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Восстановить'}));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/trash/deleted/restore', {method: 'POST'}));
    expect(await screen.findByText('Корзина пуста.')).toBeInTheDocument();
  });
  it('retains a deleted record and displays a restoration conflict', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.includes('/restore')) throw new Error('conflict');
      return {total: 1, items: [{id: 'deleted', entity_type: 'process', name: 'Сборка',
        deleted_by: 'admin', deleted_at: '2026-10-05T09:00:00Z'}]};
    });
    renderWithProviders(<TrashPage />);
    await userEvent.click(await screen.findByRole('button', {name: 'Восстановить'}));
    expect(await screen.findByText('Не удалось восстановить')).toBeInTheDocument();
    expect(screen.getByText('Сборка')).toBeInTheDocument();
  });
});

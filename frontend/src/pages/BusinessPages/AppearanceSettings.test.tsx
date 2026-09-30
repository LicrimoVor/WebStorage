import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {AppearanceSettings} from './AppearanceSettings';

vi.mock('@/shared/api', () => ({getErrorMessage: () => 'Ошибка', apiRequest: vi.fn(async (_path, options) => options?.method === 'PUT' ? JSON.parse(options.body) : {light: null, dark: null})}));

it('saves the palette to the current account and restores defaults', async () => {
  renderWithProviders(<AppearanceSettings username="tester" />);
  const color = await screen.findByLabelText('Светлая: Основной цвет');
  fireEvent.change(color, {target: {value: '#123456'}});
  await userEvent.click(screen.getByRole('button', {name: 'Сохранить цвета'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/auth/appearance', expect.objectContaining({method: 'PUT', body: expect.stringContaining('#123456')})));
  await screen.findByText('Цвета сохранены');
  await userEvent.click(screen.getByRole('button', {name: 'Стандартные цвета'}));
  await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/auth/appearance', {method: 'PUT', body: JSON.stringify({light: null, dark: null})}));
});

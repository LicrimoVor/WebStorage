import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';

import {changePassword} from '@/entities/Auth';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ProfilePage} from './index';

vi.mock('@/entities/Auth', () => ({
  useAuthProfileQuery: () => ({data: {
    username: 'operator', roles: ['warehouse'], created_at: '2026-09-17T12:00:00Z',
    last_login_at: '2026-09-17T12:00:00Z', can_change_password: true,
  }}),
  changePassword: vi.fn().mockResolvedValue(undefined),
}));

it('shows the profile and requires matching new passwords before submitting', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePage />);
  expect(screen.getByRole('heading', {name: 'operator'})).toBeInTheDocument();
  expect(screen.getByText('Склад')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Текущий пароль'), 'current password');
  await user.type(screen.getByLabelText('Новый пароль'), 'new password');
  await user.type(screen.getByLabelText('Повторите новый пароль'), 'different password');
  await user.click(screen.getByRole('button', {name: 'Изменить пароль'}));
  expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
  expect(changePassword).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('Повторите новый пароль'));
  await user.type(screen.getByLabelText('Повторите новый пароль'), 'new password');
  await user.click(screen.getByRole('button', {name: 'Изменить пароль'}));
  await waitFor(() => expect(changePassword).toHaveBeenCalledWith({
    current_password: 'current password', new_password: 'new password',
  }, expect.anything()));
  expect(await screen.findByText('Пароль изменён')).toBeInTheDocument();
  expect(screen.getByLabelText('Текущий пароль')).toHaveValue('');
});

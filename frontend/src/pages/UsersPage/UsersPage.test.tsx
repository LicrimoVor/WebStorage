import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {apiRequest} from '@/shared/api';
import {UsersPage} from './UsersPage';

vi.mock('@/entities/Auth', () => ({authKeys: {session: ['auth', 'session']}, useAuthSessionQuery: () => ({data: {username: 'admin', roles: ['admin']}})}));
vi.mock('@/shared/api', () => ({apiRequest: vi.fn(), getErrorMessage: () => 'Ошибка'}));

it('creates a regular user with selected tabs and requires password confirmation', async () => {
  vi.mocked(apiRequest).mockResolvedValue([]);
  const user = userEvent.setup();
  renderWithProviders(<UsersPage />);
  await user.click(screen.getByRole('button', {name: 'Добавить пользователя'}));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toHaveFocus(), {timeout: 5000});
  await user.type(screen.getByLabelText('Логин пользователя'), 'operator');
  await user.type(screen.getByLabelText('Пароль пользователя'), 'long password!');
  expect(screen.getByRole('button', {name: 'Сохранить'})).toBeDisabled();
  await user.type(screen.getByLabelText('Повтор пароля'), 'long password!');
  await user.click(screen.getByRole('checkbox', {name: 'Склад'}));
  await user.click(screen.getByRole('button', {name: 'Сохранить'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users', expect.objectContaining({method: 'POST'})));
  const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(call?.[1]?.body as string)).toEqual({username: 'operator', password: 'long password!', is_admin: false, active: true, permissions: ['warehouse']});
});

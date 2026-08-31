import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {login} from '@/entities/Auth';
import type * as AuthExports from '@/entities/Auth';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {LoginPage} from './LoginPage';

vi.mock('@/entities/Auth', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthExports>();
  return {...actual, login: vi.fn()};
});

describe('LoginPage', () => {
  it('authenticates with the entered credentials', async () => {
    const session = {username: 'operator', roles: ['warehouse' as const], expires_at: null};
    vi.mocked(login).mockResolvedValue(session);
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<LoginPage onAuthenticated={onAuthenticated} />, '/');
    await user.type(screen.getByLabelText('Логин'), ' operator ');
    await user.type(screen.getByLabelText('Пароль'), 'a very long password');
    await user.click(screen.getByRole('button', {name: 'Войти'}));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        username: 'operator',
        password: 'a very long password',
      }, expect.anything());
      expect(onAuthenticated).toHaveBeenCalledWith(session);
    });
    expect(document.title).toBe('Вход — Веб-склад');
  });
});

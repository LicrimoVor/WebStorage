import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {AppHeader} from './AppHeader';

// JSDOM does not apply viewport media queries; visibility is checked in a browser.
vi.mock('./App.module.scss', () => ({default: {}}));

it('opens navigation, closes on selection and Escape, and keeps account actions available', async () => {
  const user = userEvent.setup();
  const logout = vi.fn();
  renderWithProviders(<AppHeader username="operator" pending={false} onLogout={logout} />);
  const toggle = screen.getByRole('button', {name: 'Открыть меню'});
  await user.click(toggle);
  const menu = await screen.findByRole('dialog', {name: 'Меню навигации'});
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await waitFor(() => expect(menu).toHaveFocus(), {timeout: 5000});
  expect(within(menu).getByText('operator')).toBeInTheDocument();
  expect(within(menu).getByRole('button', {name: 'Настройки'})).toHaveAttribute('href', '/settings');
  await user.click(within(menu).getByRole('button', {name: 'Операции'}));
  await waitFor(() => expect(menu).not.toBeInTheDocument());
  await user.click(toggle);
  const reopened = await screen.findByRole('dialog', {name: 'Меню навигации'});
  await waitFor(() => expect(reopened).toHaveFocus(), {timeout: 5000});
  await user.keyboard('{Escape}');
  await waitFor(() => expect(reopened).not.toBeInTheDocument());
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

import {act, fireEvent, screen} from '@testing-library/react';
import {afterEach, beforeAll, expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {InstallAppButton} from './InstallAppButton';
import {clearInstallPrompt, registerInstallPrompt} from './installPrompt';
beforeAll(registerInstallPrompt);
afterEach(() => act(clearInstallPrompt));
it('keeps the install prompt received before mounting and opens it on click', () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event('beforeinstallprompt', {cancelable: true});
  Object.defineProperty(event, 'prompt', {value: prompt});
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  renderWithProviders(<InstallAppButton />);
  fireEvent.click(screen.getByRole('button', {name: 'Установить приложение'}));
  expect(prompt).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', {name: 'Установить приложение'})).not.toBeInTheDocument();
});
it('hides the button after installation', () => {
  window.dispatchEvent(new Event('beforeinstallprompt', {cancelable: true}));
  renderWithProviders(<InstallAppButton />);
  expect(screen.getByRole('button', {name: 'Установить приложение'})).toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('appinstalled')));
  expect(screen.queryByRole('button', {name: 'Установить приложение'})).not.toBeInTheDocument();
});

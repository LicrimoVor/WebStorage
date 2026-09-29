import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import type * as ApiModule from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ImportCatalogButton} from './ImportCatalogButton';

vi.mock('@/shared/api', async (original) => ({...await original<typeof ApiModule>(), apiRequest: vi.fn()}));
beforeEach(() => vi.clearAllMocks());

it('rejects invalid JSON without sending a request', async () => {
  renderWithProviders(<ImportCatalogButton kind="warehouse" />);
  await userEvent.click(screen.getByRole('button', {name: 'Импорт JSON'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'JSON для импорта'}), {target: {value: '{broken'}});
  await userEvent.click(screen.getByRole('button', {name: 'Импортировать'}));
  expect(screen.getByText(/Некорректный JSON/)).toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalled();
});

it('shows the format and imports the operations example', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({new_groups: [['Сборочные']]}).mockResolvedValueOnce({created: 1});
  renderWithProviders(<ImportCatalogButton kind="operations" />);
  await userEvent.click(screen.getByRole('button', {name: 'Импорт JSON'}));
  await userEvent.click(screen.getByText('Формат JSON и пример'));
  await userEvent.click(screen.getByRole('button', {name: 'Вставить пример в поле'}));
  await userEvent.click(screen.getByRole('button', {name: 'Импортировать'}));
  expect(await screen.findByText('Создать новые группы / подгруппы?')).toBeInTheDocument();
  expect(screen.getByText('Группа: Сборочные')).toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', {name: 'Создать и импортировать'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/operations/import', expect.objectContaining({method: 'POST'})));
  const request = vi.mocked(apiRequest).mock.calls[0]?.[1];
  expect(JSON.parse(String(request?.body))).toMatchObject({version: 1, operations: [{name: 'Сборка корпуса'}]});
  expect(await screen.findByRole('status')).toHaveTextContent('Импортировано записей: 1');
});

it('returns to the unchanged JSON without importing when confirmation is cancelled', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({new_groups: [['Metal'], ['Metal', 'Sheets']]});
  renderWithProviders(<ImportCatalogButton kind="warehouse" />);
  await userEvent.click(screen.getByRole('button', {name: 'Импорт JSON'}));
  const json = '{"version":1,"materials":[{"name":"A","unit":"pcs","group":["Metal","Sheets"]}]}';
  fireEvent.change(screen.getByRole('textbox', {name: 'JSON для импорта'}), {target: {value: json}});
  await userEvent.click(screen.getByRole('button', {name: 'Импортировать'}));
  expect(await screen.findByText('Подгруппа: Metal → Sheets')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', {name: 'Вернуться к JSON'}));
  expect(screen.getByRole('textbox', {name: 'JSON для импорта'})).toHaveValue(json);
  expect(apiRequest).toHaveBeenCalledTimes(1);
});

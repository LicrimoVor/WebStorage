import {act, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {JsonImportButton, JsonImportDialog} from './index';

function Form({onSubmit, onClose}: {onSubmit: () => void; onClose: () => void}) {
  const [source, setSource] = useState('');
  return <JsonImportDialog open title="Импорт JSON" description={<p>Загрузите файл или вставьте JSON.</p>}
    source={source} onUpdate={setSource} onClose={onClose} onSubmit={onSubmit}
    example='{"version":1}' prompt="Преобразуй данные в JSON" />;
}

it('loads JSON files, strips BOM and submits their contents through the common form', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<Form onSubmit={onSubmit} onClose={vi.fn()} />);
  const file = new File([''], 'catalog.json', {type: 'application/json'});
  Object.defineProperty(file, 'text', {value: async () => '\uFEFF{"version":1}'});
  await userEvent.upload(screen.getByLabelText('Файл JSON'), file);
  await waitFor(() => expect(screen.getByRole('textbox', {name: 'JSON для импорта'})).toHaveValue('{"version":1}'));
  await userEvent.click(screen.getByRole('button', {name: 'Импортировать'}));
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('blocks submission and closing while a JSON file is being read', async () => {
  const onClose = vi.fn();
  renderWithProviders(<Form onSubmit={vi.fn()} onClose={onClose} />);
  const file = new File([''], 'catalog.json', {type: 'application/json'});
  let finish: ((value: string) => void) | undefined;
  Object.defineProperty(file, 'text', {value: () => new Promise<string>((resolve) => {finish = resolve;})});
  await userEvent.upload(screen.getByLabelText('Файл JSON'), file);
  expect(screen.getByRole('button', {name: 'Импортировать'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Отмена'})).toBeDisabled();
  expect(screen.getByLabelText('Файл JSON')).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => {finish?.('{"version":1}');});
  await waitFor(() => expect(screen.getByRole('button', {name: 'Импортировать'})).toBeEnabled());
});

it('inserts the example and rejects oversized files without replacing the source', async () => {
  renderWithProviders(<Form onSubmit={vi.fn()} onClose={vi.fn()} />);
  await userEvent.click(screen.getByText('Формат JSON и пример'));
  await userEvent.click(screen.getByRole('button', {name: 'Вставить пример в поле'}));
  const file = new File([new Uint8Array(1024 * 1024 + 1)], 'large.json', {type: 'application/json'});
  await userEvent.upload(screen.getByLabelText('Файл JSON'), file);
  expect(screen.getByText('Размер файла не должен превышать 1 МБ.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', {name: 'JSON для импорта'})).toHaveValue('{"version":1}');
});

it('renders the standard warehouse import button with its icon and default size', () => {
  renderWithProviders(<JsonImportButton onClick={vi.fn()} />);
  const button = screen.getByRole('button', {name: 'Импорт JSON'});
  expect(button).toHaveClass('g-button_size_m', 'g-button_view_normal');
  expect(button.querySelector('svg')).toBeInTheDocument();
});

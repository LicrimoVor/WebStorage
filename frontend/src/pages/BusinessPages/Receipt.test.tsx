import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import type * as ApiModule from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ReceiptPage} from './index';

vi.mock('@/entities/StockRevision', () => ({useStockRevisionRowsQuery: () => ({data: [
  {id: 'first', type: 'material', name: 'Сталь', current_quantity: '24.000000', unit: 'кг', groups: []},
  {id: 'second', type: 'material', name: 'Медь', current_quantity: '0', unit: 'кг', groups: []},
  {id: 'third', type: 'material', name: 'Алюминий', current_quantity: '0', unit: 'кг', groups: []},
]})}));
vi.mock('@/entities/InventoryGroup', () => ({useInventoryGroupsQuery: () => ({data: []})}));
vi.mock('@/entities/Funding', () => ({
  useFundingSources: () => ({data: []}),
  FundingSelect: ({onChange}: {onChange: (value: string) => void}) => <button onClick={() => onChange('funding')}>Выбрать счёт</button>,
}));
vi.mock('@/shared/api', async (original) => ({...await original<typeof ApiModule>(), apiRequest: vi.fn(async () => [])}));

it('submits only received materials with a single total and no unit prices', async () => {
  renderWithProviders(<ReceiptPage />);
  expect(screen.queryByText('Цена за единицу')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', {name: 'Приход: Сталь'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Материал для прихода'}));
  await userEvent.click(screen.getByRole('option', {name: 'Сталь · Без группы (кг)'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить материал'}));
  expect(screen.getByText('24 кг')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Материал для прихода'}));
  expect(screen.queryByRole('option', {name: 'Сталь · Без группы (кг)'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('option', {name: 'Медь · Без группы (кг)'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить материал'}));
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Сумма за приход'}), {target: {value: '123,45'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Приход: Сталь'}), {target: {value: '10'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Приход: Медь'}), {target: {value: '0'}});
  await userEvent.click(screen.getByRole('button', {name: 'Провести приход'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/warehouse/receipts', expect.objectContaining({method: 'POST'})));
  const request = vi.mocked(apiRequest).mock.calls.find(([path]) => path === '/warehouse/receipts');
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
    total_amount: '123.45', entries: [{material_id: 'first', quantity: '10'}],
  });
  expect(String(request?.[1]?.body)).not.toContain('unit_price');
  await waitFor(() => expect(screen.queryByRole('textbox', {name: 'Приход: Сталь'})).not.toBeInTheDocument());
});

it('removes a material from the receipt and makes it available again', async () => {
  renderWithProviders(<ReceiptPage />);
  await userEvent.click(screen.getByRole('combobox', {name: 'Материал для прихода'}));
  const options = screen.getAllByRole('option');
  expect(options.map((option) => option.textContent)).toEqual([
    'Алюминий · Без группы (кг)', 'Медь · Без группы (кг)', 'Сталь · Без группы (кг)',
  ]);
  await userEvent.click(screen.getByRole('option', {name: 'Сталь · Без группы (кг)'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить материал'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Приход: Сталь'}), {target: {value: '5'}});
  await userEvent.click(screen.getByRole('button', {name: 'Убрать из прихода: Сталь'}));
  expect(screen.queryByRole('textbox', {name: 'Приход: Сталь'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Материал для прихода'}));
  expect(screen.getByRole('option', {name: 'Сталь · Без группы (кг)'})).toBeInTheDocument();
});


it('imports receipt JSON into the form and displays the AI prompt and format', async () => {
  vi.mocked(apiRequest).mockClear();
  renderWithProviders(<ReceiptPage />);
  await userEvent.click(screen.getByRole('button', {name: 'Импорт JSON'}));
  fireEvent.click(screen.getByText('Формат JSON и пример'));
  expect(screen.getByLabelText('Формат JSON')).toBeInTheDocument();
  expect(screen.getByRole('textbox', {name: 'Промпт для ИИ', hidden: true})).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', {name: 'JSON складского документа'}), {target: {value: JSON.stringify({total_amount: '123.45', entries: [{material_id: 'first', quantity: '3'}]})}});
  await userEvent.click(screen.getByRole('button', {name: 'Добавить в форму'}));
  expect(screen.getByRole('textbox', {name: 'Приход: Сталь'})).toHaveValue('3');
  expect(screen.getByRole('textbox', {name: 'Сумма за приход'})).toHaveValue('123.45');
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path === '/warehouse/receipts')).toBe(false);
});

import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {createStockRevision} from '@/entities/StockRevision';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {StockRevisionPage} from './StockRevisionPage';

vi.mock('@/entities/StockRevision', () => ({
  stockRevisionKeys: {all: ['stock-revision']}, createStockRevision: vi.fn(async () => ({})),
  useStockRevisionRowsQuery: () => ({data: [
    {id: 'steel', type: 'material', name: 'Сталь', current_quantity: '24.000000', unit: 'кг', groups: []},
    {id: 'housing', type: 'semi_finished', name: 'Корпус', current_quantity: '5', unit: 'шт', groups: []},
  ]}),
}));
vi.mock('@/entities/InventoryGroup', () => ({useInventoryGroupsQuery: () => ({data: []})}));
vi.mock('@/entities/ManufacturedItem', () => ({manufacturedItemKeys: {all: ['manufactured-items']}, useProductOptionsQuery: () => ({data: []})}));
vi.mock('@/features/ManageInventoryGroups', () => ({ManageInventoryGroupsButton: () => null}));
vi.mock('../model/revisionDraft', () => ({loadRevisionDraft: async () => undefined, saveRevisionDraft: async () => {}, deleteRevisionDraft: async () => {}}));

it('adds selected rows, removes rows and submits only explicitly counted positions', async () => {
  renderWithProviders(<StockRevisionPage />);
  expect(screen.queryByRole('textbox', {name: 'Фактическое количество: Сталь'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Позиция для ревизии'}));
  await userEvent.click(screen.getByRole('option', {name: 'Сталь · Материал (кг)'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить позицию'}));
  expect(screen.getByText('24 кг')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Позиция для ревизии'}));
  await userEvent.click(screen.getByRole('option', {name: 'Корпус · Полуфабрикат (шт)'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить позицию'}));
  await userEvent.click(screen.getByRole('button', {name: 'Убрать из ревизии: Сталь'}));
  expect(screen.queryByRole('textbox', {name: 'Фактическое количество: Сталь'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', {name: 'Фактическое количество: Корпус'}), {target: {value: '0'}});
  await userEvent.click(screen.getByRole('button', {name: 'Провести ревизию'}));
  await waitFor(() => expect(createStockRevision).toHaveBeenCalledWith({comment: null, entries: [{id: 'housing', type: 'semi_finished', counted_quantity: '0'}]}));
});

it('imports JSON into the revision form without submitting it', async () => {
  vi.mocked(createStockRevision).mockClear();
  renderWithProviders(<StockRevisionPage />);
  await waitFor(() => expect(screen.getByRole('button', {name: 'Импорт JSON'})).toBeEnabled());
  await userEvent.click(screen.getByRole('button', {name: 'Импорт JSON'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'JSON складского документа'}), {target: {value: JSON.stringify({entries: [{id: 'steel', type: 'material', counted_quantity: '2.5'}]})}});
  await userEvent.click(screen.getByRole('button', {name: 'Добавить в форму'}));
  expect(screen.getByRole('textbox', {name: 'Фактическое количество: Сталь'})).toHaveValue('2.5');
  expect(screen.queryByRole('textbox', {name: 'Фактическое количество: Корпус'})).not.toBeInTheDocument();
  expect(createStockRevision).not.toHaveBeenCalled();
});

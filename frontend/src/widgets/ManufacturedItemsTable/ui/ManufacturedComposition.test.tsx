import {screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {MaterialsTableWidget} from '@/widgets/MaterialsTable';

vi.mock('@/entities/Auth', () => ({useAuthSessionQuery: () => ({data: {roles: ['admin']}})}));
vi.mock('@/entities/ManufacturedItem', () => ({useProductOptionsQuery: () => ({data: [{id: 'product', name: 'Корпус'}]})}));
vi.mock('@/entities/StockRevision', () => ({useStockRevisionRowsQuery: () => ({data: [
  {id: 'product', name: 'Корпус', type: 'product', current_quantity: '1', unit: 'шт', products: []},
  {id: 'semi', name: 'Заготовка', type: 'semi_finished', current_quantity: '2', unit: 'шт', products: [{id: 'product'}]},
]})}));
vi.mock('@/features/CreateManufacturedItem', () => ({CreateManufacturedItemButton: () => <button>Создать позицию</button>}));
vi.mock('@/features/EditManufacturedItem', () => ({EditManufacturedItemButton: () => null}));
vi.mock('@/features/ProduceManufacturedItem', () => ({ProduceManufacturedItemButton: () => <button>Произвести</button>}));
vi.mock('@/features/ViewManufacturedInventoryHistory', () => ({ManufacturedInventoryHistoryButton: () => null}));
vi.mock('@/shared/api', () => ({
  getErrorMessage: () => 'Ошибка',
  apiRequest: vi.fn(async (path: string) => path.startsWith('/warehouse/catalog') ? {items: [{id: 'semi', kind: 'semi_finished', name: 'Заготовка', unit: 'шт', free_quantity: '2', required_quantity: '3', deficit_quantity: '1'}], total: 1, pages: 1} : path.endsWith('/composition') ? ({process_id: 'process', has_recipe: true, version_number: 1,
    entries: [{id: 'plate', kind: 'material', name: 'Лист металла', unit: 'кг', quantity: '2.5'}]}) : ({
      id: 'semi', name: 'Заготовка', product_id: 'product', is_product: false, unit: 'шт', free_quantity: '2', required_quantity: '3', to_produce_quantity: '1', groups: [], archived: false, created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z',
    })),
}));

it('opens the selected composition in a dialog and links to its process', async () => {
  renderWithProviders(<MaterialsTableWidget />);
  expect(screen.queryByRole('button', {name: 'Перейти в техпроцесс'})).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', {name: 'Действия'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Произвести'})).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', {name: 'Заготовка'}));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Заготовка')).toBeInTheDocument();
  expect(await screen.findByRole('button', {name: 'Произвести'})).toBeInTheDocument();
  expect(within(dialog).getByText('Корпус')).toBeInTheDocument();
  expect(await within(dialog).findByText('Лист металла')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Перейти в техпроцесс'})).toHaveAttribute('href', '/processes/process');
  await userEvent.click(screen.getByRole('button', {name: 'Закрыть'}));
});

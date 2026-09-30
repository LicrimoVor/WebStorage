import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {apiRequest} from '@/shared/api';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ManufacturedItemsTableWidget} from './ManufacturedItemsTableWidget';

vi.mock('@/shared/api', () => ({apiRequest: vi.fn(), getErrorMessage: () => 'Network error'}));

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {
    ...actual,
    useManufacturedItemsQuery: vi.fn(),
    useProductOptionsQuery: () => ({data: []}),
  };
});
vi.mock('@/entities/InventoryGroup', () => ({
  inventoryGroupKeys: {all: ['inventory-groups']},
  useInventoryGroupsQuery: () => ({data: []}),
}));

describe('ManufacturedItemsTableWidget states', () => {
  it('renders loading state', () => {
    vi.mocked(apiRequest).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByLabelText('Загрузка материалов')).toBeInTheDocument();
  });
  it('renders empty state', async () => {
    vi.mocked(apiRequest).mockResolvedValue({items: [], total: 0, pages: 0});
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(await screen.findByText('Полуфабрикаты: пока нет позиций')).toBeInTheDocument();
  });
  it('renders recoverable error state', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network'));
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(await screen.findByRole('button', {name: 'Повторить'})).toBeInTheDocument();
  });
});

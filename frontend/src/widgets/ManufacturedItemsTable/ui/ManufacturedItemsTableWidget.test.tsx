import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useStockRevisionRowsQuery} from '@/entities/StockRevision';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ManufacturedItemsTableWidget} from './ManufacturedItemsTableWidget';

vi.mock('@/entities/StockRevision', () => ({useStockRevisionRowsQuery: vi.fn()}));

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
    vi.mocked(useStockRevisionRowsQuery).mockReturnValue({
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useStockRevisionRowsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    vi.mocked(useStockRevisionRowsQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: [],
    } as unknown as ReturnType<typeof useStockRevisionRowsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByText('Полуфабрикаты и продукты пока не добавлены')).toBeInTheDocument();
  });

  it('renders recoverable error state', () => {
    vi.mocked(useStockRevisionRowsQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useStockRevisionRowsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByRole('button', {name: 'Повторить'})).toBeInTheDocument();
  });
});

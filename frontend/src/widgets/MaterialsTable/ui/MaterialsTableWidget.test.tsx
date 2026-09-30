import {screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {apiRequest} from '@/shared/api';
import {useProductOptionsQuery} from '@/entities/ManufacturedItem';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {MaterialsTableWidget} from './MaterialsTableWidget';

vi.mock('@/shared/api', () => ({apiRequest: vi.fn(), getErrorMessage: () => 'Network error'}));
vi.mock('@/entities/ManufacturedItem', () => ({
  useProductOptionsQuery: vi.fn(),
}));
vi.mock('@/entities/InventoryGroup', () => ({
  inventoryGroupKeys: {all: ['inventory-groups']},
  useInventoryGroupsQuery: () => ({data: []}),
}));

describe('MaterialsTableWidget states', () => {
  beforeEach(() => {
    vi.mocked(useProductOptionsQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useProductOptionsQuery>);
  });
  it('renders loading state', () => {
    vi.mocked(apiRequest).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MaterialsTableWidget />);
    expect(screen.getByLabelText('Загрузка материалов')).toBeInTheDocument();
  });
  it('renders empty state', async () => {
    vi.mocked(apiRequest).mockResolvedValue({items: [], total: 0, pages: 0});
    renderWithProviders(<MaterialsTableWidget />);
    expect(await screen.findByText('Материалы: пока нет позиций')).toBeInTheDocument();
  });
  it('renders recoverable error state', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network'));
    renderWithProviders(<MaterialsTableWidget />);
    expect(await screen.findByText('Не удалось загрузить материалы')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Повторить'})).toBeInTheDocument();
  });
});

import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ManufacturedItemsTableWidget} from './ManufacturedItemsTableWidget';

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {...actual, useManufacturedItemsQuery: vi.fn()};
});

describe('ManufacturedItemsTableWidget states', () => {
  it('renders loading state', () => {
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getAllByLabelText(/^Загрузка:/)).toHaveLength(2);
  });

  it('renders empty state', () => {
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByText('Полуфабрикаты пока не добавлены')).toBeInTheDocument();
    expect(screen.getByText('Продукты пока не добавлены')).toBeInTheDocument();
  });

  it('renders recoverable error state', () => {
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByText('Не удалось загрузить: полуфабрикаты')).toBeInTheDocument();
    expect(screen.getByText('Не удалось загрузить: продукты')).toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: 'Повторить'})).toHaveLength(2);
  });
});

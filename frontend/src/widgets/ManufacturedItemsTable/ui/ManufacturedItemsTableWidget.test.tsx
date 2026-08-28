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
    expect(screen.getByLabelText('Загрузка производимых позиций')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(screen.getByText('Производимых позиций пока нет')).toBeInTheDocument();
  });

  it('renders recoverable error state', () => {
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
    renderWithProviders(<ManufacturedItemsTableWidget />);
    expect(
      screen.getByText('Не удалось загрузить производимые позиции'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Повторить'})).toBeInTheDocument();
  });
});

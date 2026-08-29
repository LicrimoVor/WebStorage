import {screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type * as ManufacturedExports from '@/entities/ManufacturedItem';
import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import type * as SaleExports from '@/entities/Sale';
import {useSalesQuery, useSalesSummaryQuery} from '@/entities/Sale';
import {saleFixture, saleSummaryFixture} from '@/entities/Sale/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {SalesPage} from './SalesPage';

vi.mock('@/entities/Sale', async (importOriginal) => {
  const actual = await importOriginal<typeof SaleExports>();
  return {...actual, useSalesQuery: vi.fn(), useSalesSummaryQuery: vi.fn()};
});

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedExports>();
  return {...actual, useManufacturedItemsQuery: vi.fn()};
});

describe('SalesPage', () => {
  beforeEach(() => {
    vi.mocked(useSalesQuery).mockReturnValue({
      data: {
        items: [saleFixture],
        page: 1,
        page_size: 20,
        total: 1,
        pages: 1,
        filtered_quantity: saleFixture.quantity,
        filtered_amount: saleFixture.total_amount,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSalesQuery>);
    vi.mocked(useSalesSummaryQuery).mockReturnValue({
      data: saleSummaryFixture,
    } as unknown as ReturnType<typeof useSalesSummaryQuery>);
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      data: {items: [], page: 1, page_size: 100, total: 0, pages: 0},
      isPending: false,
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
  });

  it('shows filtered sales and totals', () => {
    renderWithProviders(<SalesPage />, '/sales');
    expect(screen.getByRole('heading', {name: 'Продажи'})).toBeInTheDocument();
    expect(screen.getByText('Готовое изделие')).toBeInTheDocument();
    expect(screen.getAllByText('24,68 ₽').length).toBeGreaterThan(0);
    expect(screen.getByText(/Всего: 1/)).toBeInTheDocument();
  });
});

import {screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';

import {useProcurementQuery} from '@/entities/Procurement';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ProcurementPage} from './ProcurementPage';

vi.mock('@/entities/Procurement', () => ({useProcurementQuery: vi.fn()}));
vi.mock('@/features/ExportExcel', () => ({
  ExportExcelButton: ({dataset, params}: {dataset: string; params: {search: string}}) => <button>{dataset}:{params.search}</button>,
}));

it('shows shortage, incomplete cost and exports the active search', () => {
  vi.mocked(useProcurementQuery).mockReturnValue({
    isPending: false, isError: false, isFetching: false, refetch: vi.fn(),
    data: {
      items: [{material_id: '1', name: 'Латунь', unit: 'кг', required_quantity: '10',
        stock_quantity: '3', purchase_quantity: '7', unit_price: null, estimated_cost: null,
        target_date: null, active_plans: 2, url: null, archived: false}],
      total: 1, unpriced_positions: 1, known_cost: '0', page: 1, page_size: 20, pages: 1,
      generated_at: '2026-09-06T10:00:00Z',
    },
  } as unknown as ReturnType<typeof useProcurementQuery>);
  renderWithProviders(<ProcurementPage />, '/procurement?search=Латунь');
  expect(screen.getByRole('heading', {name: 'Закупки по дефициту'})).toBeVisible();
  expect(screen.getByText('Латунь')).toBeVisible();
  expect(screen.getByText('7')).toBeVisible();
  expect(screen.getByText(/Сумма неполная/)).toBeVisible();
  expect(screen.getByRole('button', {name: 'procurement:Латунь'})).toBeVisible();
});

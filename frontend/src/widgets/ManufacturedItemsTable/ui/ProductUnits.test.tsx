import {screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ProductUnits} from './ProductUnits';

vi.mock('@/shared/api', () => ({getErrorMessage: () => 'Ошибка', apiRequest: vi.fn(async () => [
  {id: 'anonymous-id', serial_number: null, created_at: '2026-09-30T00:00:00Z', sale_id: null, issued_for_repair_id: null, photo: null},
  {id: 'numbered-id', serial_number: 'N-01', created_at: '2026-09-30T00:00:00Z', sale_id: 'sale-id', issued_for_repair_id: null, photo: null},
])}));

it('shows both anonymous and numbered units with their status', async () => {
  renderWithProviders(<ProductUnits productId="product" />);
  expect(await screen.findByText('Без номера')).toBeInTheDocument();
  expect(screen.getByText('anonymous-id')).toBeInTheDocument();
  expect(screen.getByText('N-01')).toBeInTheDocument();
  expect(screen.getByText('Продано')).toBeInTheDocument();
  expect(screen.getByText('На складе')).toBeInTheDocument();
});

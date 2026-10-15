import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {apiRequest} from '@/shared/api';
import {ReleasedStock} from './ReleasedStock';

vi.mock('@/entities/ManufacturedItem', () => ({useManufacturedItemsQuery: () => ({data: {items: [{id: 'product', name: 'Редуктор', unit: 'шт', released_quantity: 2}], total: 1}})}));
vi.mock('@/shared/api', async (original) => ({...await original<object>(), apiRequest: vi.fn().mockResolvedValue([{id: 'unit', serial_number: 'ID / №1', sale_id: null, issued_for_repair_id: null, photo: null, created_at: '2026-10-15T10:00:00Z'}])}));
it('opens available IDs from a released product row', async () => {
  renderWithProviders(<ReleasedStock />);
  expect(screen.getByText('2 шт')).toBeVisible();
  await userEvent.click(screen.getByRole('button', {name: 'Редуктор'}));
  expect(await screen.findByText('ID / №1')).toBeInTheDocument();
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/product-units?product_id=product&offset=0&limit=50&available_only=true'));
});

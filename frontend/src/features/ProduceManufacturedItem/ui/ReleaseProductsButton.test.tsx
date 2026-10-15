import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ReleaseProductsButton} from './ReleaseProductsButton';
vi.mock('@/entities/ManufacturedItem', () => ({useProductOptionsQuery: () => ({data: [{id: 'product', name: 'Изделие', free_quantity: '2', unit: 'шт', is_accountable: true}]})}));
vi.mock('@/shared/api', async (original) => ({...await original<object>(), apiRequest: vi.fn().mockResolvedValue({id: 'release'})}));
it('assigns a manual ID to available stock using the release endpoint', async () => {
  renderWithProviders(<ReleaseProductsButton productId="product" />);
  await userEvent.click(screen.getByRole('button', {name: 'Выпуск продукции'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'ID изделия 1'}), {target: {value: '  Узел № 1 / α; | 😀  '}});
  await userEvent.click(screen.getByRole('button', {name: 'Выпустить'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/product-releases', expect.objectContaining({method: 'POST', body: JSON.stringify({product_id: 'product', serial_numbers: ['  Узел № 1 / α; | 😀  ']})})));
});

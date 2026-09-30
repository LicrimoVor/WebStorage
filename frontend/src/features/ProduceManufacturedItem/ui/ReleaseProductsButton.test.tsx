import {screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {useProductOptionsQuery} from '@/entities/ManufacturedItem';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ReleaseProductsButton} from './ReleaseProductsButton';

vi.mock('@/entities/ManufacturedItem', () => ({useProductOptionsQuery: vi.fn()}));
vi.mock('./ProduceManufacturedItemButton', () => ({
  ProduceManufacturedItemButton: ({itemName, serialized}: {itemName: string; serialized: boolean}) =>
    <button>{itemName}: {serialized ? 'numbered' : 'quantity'}</button>,
}));

it('offers byproducts for quantity-based release from the warehouse', async () => {
  vi.mocked(useProductOptionsQuery).mockReturnValue({data: [
    {id: 'byproduct', name: 'Побочный продукт', is_product: false, is_byproduct: true},
  ], isPending: false} as never);
  const user = userEvent.setup();
  renderWithProviders(<ReleaseProductsButton />);
  await user.click(screen.getByRole('button', {name: 'Выпуск продукции'}));
  expect(useProductOptionsQuery).toHaveBeenLastCalledWith(true, 'saleable');
  await user.click(screen.getByRole('combobox', {name: 'Продукт для выпуска'}));
  await user.click(await screen.findByText('Побочный продукт'));
  expect(screen.getByRole('button', {name: 'Побочный продукт: quantity'})).toBeInTheDocument();
});

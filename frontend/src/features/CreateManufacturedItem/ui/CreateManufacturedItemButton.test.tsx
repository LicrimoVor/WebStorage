import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {createManufacturedItem} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {manufacturedItemFixture} from '@/entities/ManufacturedItem/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {CreateManufacturedItemButton} from './CreateManufacturedItemButton';

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {...actual, createManufacturedItem: vi.fn()};
});

describe('CreateManufacturedItemButton', () => {
  it('creates a semi-finished item with an exact quantity string', async () => {
    vi.mocked(createManufacturedItem).mockResolvedValue(manufacturedItemFixture);
    const user = userEvent.setup();
    renderWithProviders(<CreateManufacturedItemButton />);

    await user.click(screen.getByRole('button', {name: 'Создать позицию'}));
    await user.type(
      screen.getByLabelText('Название производимой позиции'),
      'Корпус редуктора',
    );
    await user.clear(
      screen.getByLabelText('Начальный остаток производимой позиции'),
    );
    await user.type(
      screen.getByLabelText('Начальный остаток производимой позиции'),
      '4,5',
    );
    await user.click(screen.getByRole('button', {name: 'Создать'}));

    await waitFor(() =>
      expect(createManufacturedItem).toHaveBeenCalledWith({
        name: 'Корпус редуктора',
        is_product: false,
        unit: 'шт.',
        initial_quantity: '4.5',
        image: null,
      }),
    );
  });
});

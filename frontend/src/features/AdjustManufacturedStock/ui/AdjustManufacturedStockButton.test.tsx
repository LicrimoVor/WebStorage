import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {createManufacturedItemMovement} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {manufacturedItemFixture} from '@/entities/ManufacturedItem/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {AdjustManufacturedStockButton} from './AdjustManufacturedStockButton';

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {...actual, createManufacturedItemMovement: vi.fn()};
});

describe('AdjustManufacturedStockButton', () => {
  it('posts a receipt to the manufactured item ledger', async () => {
    vi.mocked(createManufacturedItemMovement).mockResolvedValue({
      id: '1a828c6d-7dbf-44fd-a507-308743e68f3d',
      manufactured_item_id: manufacturedItemFixture.id,
      movement_type: 'receipt',
      quantity: '2.250000',
      balance_before: '4.500000',
      balance_after: '6.750000',
      comment: 'Выпуск',
      source_type: 'manual',
      source_id: null,
      production_record_id: null,
      created_at: '2026-08-28T06:00:00Z',
    });
    const user = userEvent.setup();
    renderWithProviders(
      <AdjustManufacturedStockButton item={manufacturedItemFixture} />,
    );

    await user.click(screen.getByRole('button', {name: 'Остаток'}));
    await user.type(
      screen.getByLabelText('Количество движения производимой позиции'),
      '2,25',
    );
    await user.type(
      screen.getByLabelText('Комментарий движения производимой позиции'),
      'Выпуск',
    );
    await user.click(screen.getByRole('button', {name: 'Провести'}));

    await waitFor(() =>
      expect(createManufacturedItemMovement).toHaveBeenCalledWith(
        manufacturedItemFixture.id,
        {movement_type: 'receipt', quantity: '2.25', comment: 'Выпуск'},
      ),
    );
  });
});

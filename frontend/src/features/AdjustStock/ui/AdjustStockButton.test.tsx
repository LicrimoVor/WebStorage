import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {createInventoryMovement} from '@/entities/Material';
import type * as MaterialExports from '@/entities/Material';
import {materialFixture} from '@/entities/Material/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {AdjustStockButton} from './AdjustStockButton';

vi.mock('@/entities/Funding', () => ({
  FundingSelect: ({value, onChange}: {value: string; onChange: (value: string) => void}) => <select aria-label="Источник финансирования" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Выберите</option><option value="account">Счёт</option></select>,
}));

vi.mock('@/entities/Material' , async (importOriginal) => {
  const actual = await importOriginal<typeof MaterialExports>();
  return {...actual, createInventoryMovement: vi.fn()};
});

describe('AdjustStockButton', () => {
  it('posts a receipt movement', async () => {
    vi.mocked(createInventoryMovement).mockResolvedValue({
      id: '1a828c6d-7dbf-44fd-a507-308743e68f3d',
      material_id: materialFixture.id,
      movement_type: 'receipt',
      quantity: '2.250000',
      balance_before: '10.500000',
      balance_after: '12.750000',
      comment: 'Поставка',
      source_type: 'manual',
      source_id: null,
      production_record_id: null,
      unit_price_snapshot: null,
      total_amount_snapshot: null,
      created_at: '2026-08-28T06:00:00Z',
    });
    const user = userEvent.setup();
    renderWithProviders(<AdjustStockButton material={materialFixture} />);

    await user.click(screen.getByRole('button', {name: 'Остаток'}));
    await user.type(screen.getByLabelText('Количество движения'), '2,25');
    await user.type(screen.getByLabelText('Комментарий'), 'Поставка');
    await user.selectOptions(screen.getByLabelText('Источник финансирования'), 'account');
    await user.click(screen.getByRole('button', {name: 'Провести'}));

    await waitFor(() =>
      expect(createInventoryMovement).toHaveBeenCalledWith(materialFixture.id, {
        movement_type: 'receipt',
        quantity: '2.25',
        funding_source_id: 'account',
        comment: 'Поставка',
      }),
    );
  });
});

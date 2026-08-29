import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {
  registerDirectProduction,
  useDirectProductionPreviewQuery,
} from '@/entities/Production';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ProduceManufacturedItemButton} from './ProduceManufacturedItemButton';

vi.mock('@/entities/Employee', () => ({
  employeeKeys: {all: ['employees']},
  useEmployeesQuery: () => ({data: {items: []}, isPending: false}),
}));
vi.mock('@/entities/ManufacturedItem', () => ({
  manufacturedItemKeys: {all: ['manufactured-items']},
}));
vi.mock('@/entities/Material', () => ({materialKeys: {all: ['materials']}}));
vi.mock('@/entities/Operation', () => ({operationKeys: {all: ['operations']}}));
vi.mock('@/entities/WorkPayroll', () => ({workPayrollKeys: {all: ['payroll']}}));
vi.mock('@/entities/Production', () => ({
  productionKeys: {all: ['production']},
  registerDirectProduction: vi.fn(),
  useDirectProductionPreviewQuery: vi.fn(),
}));

describe('ProduceManufacturedItemButton', () => {
  it('shows recursive requirements and submits direct production', async () => {
    vi.mocked(useDirectProductionPreviewQuery).mockReturnValue({
      data: {
        item_id: 'product-id',
        item_name: 'Редуктор',
        item_unit: 'ед',
        quantity: '1',
        can_produce: true,
        tree: {
          item_id: 'product-id',
          name: 'Редуктор',
          unit: 'ед',
          required_quantity: '1',
          stock_used_quantity: '0',
          to_produce_quantity: '1',
          process_version_id: 'version-id',
          process_version_number: 1,
          recipe_source: 'Активный техпроцесс',
          children: [],
        },
        materials: [
          {
            material_id: 'material-id',
            name: 'Сталь',
            unit: 'кг',
            required_quantity: '2',
            stock_used_quantity: '2',
            deficit_quantity: '0',
          },
        ],
        operations: [],
      },
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(registerDirectProduction).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderWithProviders(
      <ProduceManufacturedItemButton itemId="product-id" itemName="Редуктор" />,
    );

    await user.click(screen.getByRole('button', {name: 'Произвести'}));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Поддерево производства')).toBeInTheDocument();
    expect(within(dialog).getByText('Сталь')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', {name: 'Произвести'}));

    await waitFor(() =>
      expect(registerDirectProduction).toHaveBeenCalledWith(
        'product-id',
        {quantity: '1', operation_assignments: [], comment: null},
        expect.any(String),
      ),
    );
  });
});

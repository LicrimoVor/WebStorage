import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {registerProduction} from '@/entities/Production';
import type * as ProductionExports from '@/entities/Production';
import {
  updateProductionPlan,
  useProductionPlanSummaryQuery,
  useProductionPlansQuery,
  type ProductionPlan,
} from '@/entities/ProductionPlan';
import type * as ProductionPlanExports from '@/entities/ProductionPlan';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ProductionPlansPage} from './ProductionPlansPage';

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {...actual, useManufacturedItemsQuery: vi.fn()};
});

vi.mock('@/entities/ProductionPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof ProductionPlanExports>();
  return {
    ...actual,
    updateProductionPlan: vi.fn(),
    useProductionPlansQuery: vi.fn(),
    useProductionPlanSummaryQuery: vi.fn(),
  };
});

vi.mock('@/entities/Production', async (importOriginal) => {
  const actual = await importOriginal<typeof ProductionExports>();
  return {
    ...actual,
    registerProduction: vi.fn(),
    useProductionRecordsQuery: vi.fn(),
  };
});

const plan: ProductionPlan = {
  id: '10000000-0000-4000-8000-000000000001',
  product_id: '20000000-0000-4000-8000-000000000001',
  product_name: 'Редуктор',
  product_unit: 'шт.',
  process_version_id: '30000000-0000-4000-8000-000000000001',
  process_version_number: 2,
  planned_quantity: '10.000000',
  produced_quantity: '3.000000',
  remaining_quantity: '7.000000',
  status: 'active',
  target_date: null,
  created_by: 'tester',
  calculation_complete: true,
  missing_data: [],
  total_required_time_minutes: '60.000000',
  total_required_hours: '1.000000',
  estimated_cost: '100.00',
  materials: [],
  manufactured_items: [],
  operations: [],
  created_at: '2026-08-28T10:00:00Z',
  updated_at: '2026-08-28T10:00:00Z',
};

describe('ProductionPlansPage production execution', () => {
  beforeEach(() => {
    vi.mocked(useManufacturedItemsQuery).mockReturnValue({
      isPending: false,
      data: {items: [], page: 1, page_size: 100, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
    vi.mocked(useProductionPlansQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [plan], page: 1, page_size: 20, total: 1, pages: 1},
    } as unknown as ReturnType<typeof useProductionPlansQuery>);
    vi.mocked(useProductionPlanSummaryQuery).mockReturnValue({
      isPending: false,
      data: {
        active_plans: 1,
        products_to_produce: '7.000000',
        material_positions: 0,
        material_deficit_positions: 0,
        total_required_hours: '1.000000',
        estimated_cost: '100.00',
        calculation_complete: true,
      },
    } as unknown as ReturnType<typeof useProductionPlanSummaryQuery>);
    vi.mocked(registerProduction).mockResolvedValue({
      id: '40000000-0000-4000-8000-000000000001',
      production_plan_id: plan.id,
      item_id: plan.product_id,
      item_name: plan.product_name,
      item_unit: plan.product_unit,
      quantity: '2.000000',
      process_version_id: plan.process_version_id,
      process_version_number: 2,
      idempotency_key: 'test-command-key',
      created_by: 'tester',
      comment: null,
      output_movement_id: '50000000-0000-4000-8000-000000000001',
      output_balance_after: '2.000000',
      components: [],
      created_at: '2026-08-28T11:00:00Z',
    });
  });

  it('edits quantity and date, preserves production history and removes cancellation', async () => {
    vi.mocked(updateProductionPlan).mockResolvedValue({...plan, planned_quantity: '12', target_date: '2026-11-01'});
    renderWithProviders(<ProductionPlansPage />, '/production-plans');
    expect(screen.queryByRole('button', {name: 'Отменить'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Редактировать'}));
    const quantity = screen.getByRole('textbox', {name: 'Плановое количество'});
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    expect(screen.getByRole('button', {name: 'Сохранить'})).toBeDisabled();
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '12,5');
    await userEvent.type(screen.getByLabelText('Плановая дата'), '2026-11-01');
    await userEvent.click(screen.getByRole('button', {name: 'Сохранить'}));
    await waitFor(() => expect(updateProductionPlan).toHaveBeenCalledWith(plan.id, {planned_quantity: '12.5', target_date: '2026-11-01'}));
    await waitFor(() => expect(screen.queryByText(/Редактирование плана:/)).not.toBeInTheDocument());
  });

  it('opens requirements directly and switches between material, semi-finished and operation tables', async () => {
    const names = ['Длинное название материала '.repeat(10).trim(), 'Длинное название полуфабриката '.repeat(10).trim(), 'Длинное название операции '.repeat(10).trim()];
    const withRequirements: ProductionPlan = {...plan,
      materials: [{material_id: 'material-id', name: names[0]!, unit: 'кг', required_quantity: '4', stock_used_quantity: '1', deficit_quantity: '3', unit_price: '5', cost: '20'}],
      manufactured_items: [{manufactured_item_id: 'semi-id', process_version_id: null, name: names[1]!, unit: 'шт', required_quantity: '2', stock_used_quantity: '0', to_produce_quantity: '2', is_plan_output: false}],
      operations: [{operation_id: 'operation-id', name: names[2]!, required_quantity: '3', time_norm: '6', required_time_minutes: '18', price: '4', cost: '12'}],
    };
    vi.mocked(useProductionPlansQuery).mockReturnValue({isPending: false, isError: false,
      data: {items: [withRequirements], page: 1, page_size: 20, total: 1, pages: 1}} as unknown as ReturnType<typeof useProductionPlansQuery>);
    renderWithProviders(<ProductionPlansPage />, '/production-plans');
    expect(screen.queryByText('Показать рассчитанные потребности')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Потребности в материалах и операциях'}));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('table')).toHaveLength(1);
    expect(within(dialog).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(dialog).getByTitle(names[0]!)).toHaveAttribute('tabindex', '0');
    await waitFor(() => expect(within(dialog).getByRole('cell', {name: '3 кг'})).toBeVisible());
    await userEvent.click(within(dialog).getByRole('tab', {name: 'Полуфабрикаты'}));
    expect(within(dialog).queryByTitle(names[0]!)).not.toBeInTheDocument();
    expect(within(dialog).getByTitle(names[1]!)).toBeInTheDocument();
    expect(within(dialog).getByRole('columnheader', {name: 'Изготовить'})).toBeVisible();
    await userEvent.click(within(dialog).getByRole('tab', {name: 'Операции'}));
    expect(within(dialog).getByTitle(names[2]!)).toBeInTheDocument();
    expect(within(dialog).getByRole('cell', {name: '18'})).toBeVisible();
    expect(within(dialog).getByRole('cell', {name: '12 ₽'})).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', {name: 'Закрыть'}));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the plan without production commands', () => {
    renderWithProviders(<ProductionPlansPage />, '/production-plans');
    expect(screen.getByText(plan.product_name)).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Зарегистрировать выпуск'})).not.toBeInTheDocument();
    expect(registerProduction).not.toHaveBeenCalled();
  });
});

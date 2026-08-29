import type {AnalyticsDashboard} from './model/types';

export const analyticsDashboardFixture: AnalyticsDashboard = {
  period: {
    date_from: '2026-08-01T00:00:00Z',
    date_to: '2026-08-31T23:59:59Z',
    bucket: 'day',
  },
  production: {
    produced_products: '24.000000',
    produced_semi_finished: '12.000000',
    production_records: 5,
    plans: 4,
    completed_plans: 2,
    plan_completion_percent: '62.50',
    completed_operations: '80.000000',
    person_hours: '14.500000',
    dynamics: [
      {
        period_start: '2026-08-20T00:00:00Z',
        products_quantity: '24.000000',
        semi_finished_quantity: '12.000000',
      },
    ],
  },
  sales: {
    sold_quantity: '10.000000',
    revenue: '12500.00',
    average_unit_price: '1250.00',
    current_product_stock: '14.000000',
    dynamics: [
      {
        period_start: '2026-08-20T00:00:00Z',
        quantity: '10.000000',
        revenue: '12500.00',
      },
    ],
    by_product: [
      {
        product_id: '6415f4e9-8abf-4dbf-b58b-e1aac708fa49',
        name: 'Готовое изделие',
        unit: 'ед',
        quantity: '10.000000',
        revenue: '12500.00',
        current_stock: '14.000000',
      },
    ],
  },
  warehouse: {
    current_material_stock_value: '85000.00',
    unpriced_material_positions: 1,
    material_deficit_positions: 2,
    material_deficit_quantity: '18.000000',
    material_movements: 8,
    material_inflow: '100.000000',
    material_outflow: '40.000000',
    semi_finished_movements: 3,
    semi_finished_inflow: '20.000000',
    semi_finished_outflow: '8.000000',
    demanded_materials: [
      {
        material_id: '7415f4e9-8abf-4dbf-b58b-e1aac708fa49',
        name: 'Сталь',
        unit: 'кг',
        consumed_quantity: '40.000000',
      },
    ],
    dynamics: [
      {
        period_start: '2026-08-20T00:00:00Z',
        materials_delta: '60.000000',
        semi_finished_delta: '12.000000',
        products_delta: '14.000000',
      },
    ],
  },
  personnel: {
    accrued: '48000.00',
    paid: '30000.00',
    payable_current: '18000.00',
    completed_operations: '80.000000',
    person_hours: '14.500000',
    by_employee: [
      {
        employee_id: '8415f4e9-8abf-4dbf-b58b-e1aac708fa49',
        full_name: 'Анна Смирнова',
        accrued: '48000.00',
        paid: '30000.00',
        payable_current: '18000.00',
        completed_operations: '80.000000',
        person_hours: '14.500000',
      },
    ],
    by_operation: [
      {
        operation_id: '9415f4e9-8abf-4dbf-b58b-e1aac708fa49',
        name: 'Сборка',
        completed_operations: '80.000000',
        person_hours: '14.500000',
        accrued: '48000.00',
      },
    ],
  },
};

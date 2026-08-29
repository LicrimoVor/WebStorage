import type {Sale, SaleSummary} from './model/types';

export const saleFixture: Sale = {
  id: '7415f4e9-8abf-4dbf-b58b-e1aac708fa49',
  product_id: '8c227564-3db1-4966-a540-7d1754fa5349',
  product_name: 'Готовое изделие',
  product_unit: 'ед',
  quantity: '2.000000',
  unit_price: '12.34',
  total_amount: '24.68',
  sold_at: '2026-08-29T05:00:00Z',
  comment: 'Розница',
  inventory_movement_id: '71afe048-2ea3-4dd3-b3aa-2f9d60343aab',
  balance_after: '3.000000',
  idempotency_key: 'sale-fixture-1',
  created_by: 'local-development',
  created_at: '2026-08-29T05:00:00Z',
};

export const saleSummaryFixture: SaleSummary = {
  sales_count: 1,
  total_quantity: '2.000000',
  total_amount: '24.68',
  average_unit_price: '12.34',
};

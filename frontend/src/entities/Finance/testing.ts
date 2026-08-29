import type {FinanceEntry, FinanceSummary, FinancialTransaction} from './model/types';

export const financeEntryFixture: FinanceEntry = {
  id: '7415f4e9-8abf-4dbf-b58b-e1aac708fa49',
  source_id: '7415f4e9-8abf-4dbf-b58b-e1aac708fa49',
  source_type: 'sale',
  direction: 'income',
  category: 'Продажи',
  description: 'Готовое изделие',
  amount: '24.68',
  occurred_at: '2026-08-29T05:00:00Z',
  comment: 'Розница',
  created_by: 'local-development',
};

export const financeSummaryFixture: FinanceSummary = {
  total_income: '124.68',
  total_expense: '45.00',
  balance: '79.68',
  sales_income: '24.68',
  material_expense: '10.00',
  labour_expense: '15.00',
  manual_income: '100.00',
  manual_expense: '20.00',
  incomplete_material_movements: 0,
};

export const financialTransactionFixture: FinancialTransaction = {
  id: '70b3abe1-c004-42cf-90f3-7389514dcb79',
  transaction_type: 'expense',
  amount: '30.00',
  occurred_at: '2026-08-29T05:00:00Z',
  category: 'Аренда',
  comment: null,
  created_by: 'local-development',
  created_at: '2026-08-29T05:00:00Z',
};

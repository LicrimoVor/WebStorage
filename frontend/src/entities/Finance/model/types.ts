import type {components, operations} from '@/shared/api/generated/schema';

export type FinanceEntry = components['schemas']['FinanceEntryRead'];
export type FinanceEntryList = components['schemas']['FinanceEntryList'];
export type FinanceSummary = components['schemas']['FinanceSummary'];
export type FinanceSource = components['schemas']['FinanceSource'];
export type FinancialDirection = components['schemas']['FinancialDirection'];
export type FinancialTransactionCreate =
  components['schemas']['FinancialTransactionCreate'];
export type FinancialTransaction = components['schemas']['FinancialTransactionRead'];
export type FinanceEntryListParams = NonNullable<
  operations['listFinanceEntries']['parameters']['query']
>;
export type FinanceSummaryParams = NonNullable<
  operations['getFinanceSummary']['parameters']['query']
>;

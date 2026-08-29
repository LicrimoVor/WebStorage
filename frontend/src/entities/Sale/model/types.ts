import type {components, operations} from '@/shared/api/generated/schema';

export type Sale = components['schemas']['SaleRead'];
export type SaleList = components['schemas']['SaleList'];
export type SaleCreate = components['schemas']['SaleCreate'];
export type SaleSummary = components['schemas']['SaleSummary'];
export type SaleSortField = components['schemas']['SaleSortField'];
export type SaleListParams = NonNullable<operations['listSales']['parameters']['query']>;
export type SaleSummaryParams = NonNullable<
  operations['getSalesSummary']['parameters']['query']
>;

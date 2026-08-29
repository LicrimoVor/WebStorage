import type {components, operations} from '@/shared/api/generated/schema';

export type AnalyticsDashboard = components['schemas']['AnalyticsDashboardRead'];
export type AnalyticsBucket = components['schemas']['AnalyticsBucket'];
export type ProductionPoint = components['schemas']['ProductionPoint'];
export type SalesPoint = components['schemas']['SalesPoint'];
export type StockPoint = components['schemas']['StockPoint'];
export type ProductSalesRow = components['schemas']['ProductSalesRow'];
export type DemandedMaterialRow = components['schemas']['DemandedMaterialRow'];
export type EmployeeAnalyticsRow = components['schemas']['EmployeeAnalyticsRow'];
export type OperationAnalyticsRow = components['schemas']['OperationAnalyticsRow'];
export type AnalyticsDashboardParams = NonNullable<
  operations['getAnalyticsDashboard']['parameters']['query']
>;

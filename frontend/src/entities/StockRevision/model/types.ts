import type {components, operations} from '@/shared/api/generated/schema';

export type StockRevisionRow = components['schemas']['StockRevisionRow'];
export type StockRevision = components['schemas']['StockRevisionRead'];
export type StockRevisionCreate = components['schemas']['StockRevisionCreate'];
export type StockRevisionEntityType = components['schemas']['StockRevisionEntityType'];
export type StockRevisionListParams = NonNullable<
  operations['listStockRevisionRows']['parameters']['query']
>;

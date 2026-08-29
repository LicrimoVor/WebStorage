import type {components, operations} from '@/shared/api/generated/schema';

export type ExportDataset = components['schemas']['ExportDataset'];
export type ExportParams = NonNullable<
  operations['exportDatasetToExcel']['parameters']['query']
>;

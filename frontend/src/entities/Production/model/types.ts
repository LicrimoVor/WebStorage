import type {components} from '@/shared/api/generated/schema';

export type ProductionRecord = components['schemas']['ProductionRecordRead'];
export type ProductionRecordCreate = components['schemas']['ProductionRecordCreate'];
export type ProductionRecordList = components['schemas']['ProductionRecordList'];
export type DirectProductionCreate = components['schemas']['DirectProductionCreate'];
export type DirectProductionPreview =
  components['schemas']['DirectProductionPreviewRead'];
export type DirectProductionTree = components['schemas']['DirectProductionTreeRead'];

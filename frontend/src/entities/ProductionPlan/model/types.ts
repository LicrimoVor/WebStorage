import type {components} from '@/shared/api/generated/schema';

export type ProductionPlan = components['schemas']['ProductionPlanRead'];
export type ProductionPlanList = components['schemas']['ProductionPlanList'];
export type ProductionPlanCreate = components['schemas']['ProductionPlanCreate'];
export type ProductionPlanUpdate = components['schemas']['ProductionPlanUpdate'];
export type ProductionPlanSummary = components['schemas']['ProductionPlanSummary'];
export type ProductionPlanStatus = components['schemas']['ProductionPlanStatus'];

export interface ProductionPlanListParams {
  page: number;
  page_size: number;
  status?: ProductionPlanStatus;
}

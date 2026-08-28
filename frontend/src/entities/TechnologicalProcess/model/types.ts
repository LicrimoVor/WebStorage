import type {components, operations} from '@/shared/api/generated/schema';

export type TechnologicalProcess = components['schemas']['ProcessRead'];
export type TechnologicalProcessList = components['schemas']['ProcessList'];
export type TechnologicalProcessCreate = components['schemas']['ProcessCreate'];
export type TechnologicalProcessImportResult =
  components['schemas']['ProcessImportResult'];
export type ProcessVersion = components['schemas']['ProcessVersionRead'];
export type ProcessVersionSummary = components['schemas']['ProcessVersionSummary'];
export type ProcessVersionList = components['schemas']['ProcessVersionList'];
export type ProcessGraphInput = components['schemas']['ProcessGraphDocument-Input'];
export type ProcessGraphOutput = components['schemas']['ProcessGraphDocument-Output'];
export type ProcessNode = components['schemas']['GraphNode'];
export type ProcessEdge = components['schemas']['GraphEdge-Output'];
export type ProcessStatus = components['schemas']['ProcessStatus'];
export type ProcessSortField = components['schemas']['ProcessSortField'];
export type TechnologicalProcessListParams = NonNullable<
  operations['listTechnologicalProcesses']['parameters']['query']
>;


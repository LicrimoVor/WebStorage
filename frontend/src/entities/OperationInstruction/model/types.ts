import type {components} from '@/shared/api/generated/schema';

export type OperationInstruction = components['schemas']['InstructionRead'];
export type InstructionVersion = components['schemas']['InstructionVersionRead'];
export type InstructionVersionSummary =
  components['schemas']['InstructionVersionSummary'];
export type InstructionDraftSave = components['schemas']['InstructionDraftSave'];
export type InstructionAsset = components['schemas']['InstructionAssetRead'];
export type PublicLink = components['schemas']['PublicLinkRead'];
export type PublicLinkCreate = components['schemas']['PublicLinkCreate'];
export type PublicInstruction = components['schemas']['PublicInstructionRead'];
export type InstructionExportFormat = 'md' | 'txt' | 'docx' | 'pdf';

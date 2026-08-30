export const routes = {
  productionPlans: '/production-plans',
  warehouse: '/warehouse',
  operations: '/operations',
  operationInstructionPattern: '/operations/:operationId/instruction',
  operationInstruction: (operationId: string) =>
    `/operations/${operationId}/instruction`,
  publicInstructionPattern: '/public/instructions/:token',
  processes: '/processes',
  processEditorPattern: '/processes/:processId',
  processEditor: (processId: string) => `/processes/${processId}`,
  personnel: '/personnel',
  sales: '/sales',
  finance: '/finance',
  analytics: '/analytics',
} as const;

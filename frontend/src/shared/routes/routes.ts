export const routes = {
  productionPlans: '/production-plans',
  warehouse: '/warehouse',
  operations: '/operations',
  processes: '/processes',
  processEditorPattern: '/processes/:processId',
  processEditor: (processId: string) => `/processes/${processId}`,
  personnel: '/personnel',
  sales: '/sales',
  finance: '/finance',
} as const;

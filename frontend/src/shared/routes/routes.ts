export const routes = {
  warehouse: '/warehouse',
  operations: '/operations',
  processes: '/processes',
  processEditorPattern: '/processes/:processId',
  processEditor: (processId: string) => `/processes/${processId}`,
  personnel: '/personnel',
} as const;

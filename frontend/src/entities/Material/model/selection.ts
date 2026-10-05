import type {Material} from './types';

export const catalogRowId = (item: Material & {kind?: string}) => `${item.kind ?? 'material'}:${item.id}`;

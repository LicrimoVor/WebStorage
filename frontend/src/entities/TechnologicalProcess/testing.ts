import type {TechnologicalProcess} from './model/types';

export const technologicalProcessFixture: TechnologicalProcess = {
  id: '4e2171ab-0a79-4bd4-b012-2233bf0f15d2',
  name: 'Сборка редуктора',
  output_item_id: '98a218fd-4698-4913-9fa7-48a18386dd3a',
  output_item_name: 'Редуктор Р-10',
  archived: false,
  active_version: null,
  latest_version: {
    id: 'eb31a260-5595-42fc-9854-944b21f4f8a2',
    version_number: 2,
    status: 'draft',
    schema_version: 1,
    created_by: 'local-development',
    activated_at: null,
    created_at: '2026-08-28T05:00:00Z',
    updated_at: '2026-08-28T06:00:00Z',
  },
  created_at: '2026-08-28T05:00:00Z',
  updated_at: '2026-08-28T06:00:00Z',
};


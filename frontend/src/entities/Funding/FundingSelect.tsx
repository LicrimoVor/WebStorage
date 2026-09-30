import {Select} from '@/shared/ui/FormControls';
import {Alert} from '@gravity-ui/uikit';
import { getErrorMessage } from '@/shared/api';

import { useFundingSources } from './api';

export function FundingSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const query = useFundingSources();
  return <>
    <Select label="Источник финансирования" aria-label="Источник финансирования" width="max"
      value={value ? [value] : []} onUpdate={(ids) => onChange(ids[0] ?? '')}
      options={(query.data ?? []).filter((source) => !source.archived).map((source) => ({ value: source.id, content: source.name }))}
      placeholder="Выберите источник" loading={query.isPending} />
    {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} />}
    {query.data && !query.data.some((source) => !source.archived) && <Alert theme="info" message="Создайте источник финансирования в настройках." />}
  </>;
}

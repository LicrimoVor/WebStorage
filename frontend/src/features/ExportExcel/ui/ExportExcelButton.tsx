import {FileArrowDown} from '@gravity-ui/icons';
import {Button, Icon} from '@gravity-ui/uikit';
import {useMutation} from '@tanstack/react-query';

import {
  downloadExcel,
  type ExportDataset,
  type ExportParams,
} from '@/entities/Export';

interface ExportExcelButtonProps {
  dataset: ExportDataset;
  params?: ExportParams;
  label?: string;
  size?: 's' | 'm' | 'l' | 'xl';
}

export function ExportExcelButton({
  dataset,
  params = {},
  label = 'Экспорт Excel',
  size = 'l',
}: ExportExcelButtonProps) {
  const mutation = useMutation({
    mutationFn: () => downloadExcel(dataset, params),
  });
  const error = mutation.error instanceof Error ? mutation.error.message : undefined;

  return (
    <Button
      view={error ? 'outlined-danger' : 'outlined'}
      size={size}
      loading={mutation.isPending}
      onClick={() => mutation.mutate()}
      title={error}
    >
      <Icon data={FileArrowDown} />
      {error ? 'Повторить экспорт' : label}
    </Button>
  );
}

import {Alert, Button, Dialog, Text} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {routes} from '@/shared/routes';
import {useNavigate} from 'react-router-dom';
import {useInventoryGroupsQuery} from '@/entities/InventoryGroup';
import type {TechnologicalProcess, ProcessVersionSummary} from '@/entities/TechnologicalProcess';
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {Select, TextInput} from '@/shared/ui/FormControls';

export function ProcessSettings({process, versions, beforeOpen}: {
  process: TechnologicalProcess; versions: ProcessVersionSummary[]; beforeOpen: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(process.name);
  const [group, setGroup] = useState(process.default_group_id ?? '');
  const client = useQueryClient();
  const navigate = useNavigate();
  const groups = useInventoryGroupsQuery();
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'deactivate' | 'open') => {
      await beforeOpen();
      if (action === 'open') return;
      await apiRequest(`/technological-processes/${process.id}${action === 'deactivate' ? '/deactivate' : ''}`, {
        method: action === 'save' ? 'PATCH' : 'POST',
        ...(action === 'save' ? {body: JSON.stringify({name: name.trim(), default_group_id: group || null})} : {}),
      });
    },
    onSuccess: async (_data, action) => {
      if (action === 'open') {
        setName(process.name); setGroup(process.default_group_id ?? ''); setOpen(true);
      } else {
        await client.invalidateQueries();
        setOpen(false);
      }
    },
  });
  return <>
    <Button view="outlined" size="l" loading={mutation.isPending} onClick={() => mutation.mutate('open')}>Настройки</Button>
    {!open && mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
    <Dialog open={open} onClose={() => !mutation.isPending && setOpen(false)} maxWidth="m" fullWidth>
      <Dialog.Header caption="Настройки техпроцесса" />
      <Dialog.Body>
        <div style={{display: 'grid', gap: 16}}>
          <TextInput label="Название" value={name} onUpdate={setName} disabled={process.archived}
            controlProps={{'aria-label': 'Название техпроцесса', maxLength: 200}} />
          <Select label="Группа по умолчанию" aria-label="Группа техпроцесса" value={group ? [group] : []}
            options={(groups.data ?? []).map((item) => ({value: item.id, content: item.parent_id ? `${groups.data?.find((parent) => parent.id === item.parent_id)?.name} / ${item.name}` : item.name}))}
            onUpdate={(values) => setGroup(values[0] ?? '')} hasClear filterable disabled={process.archived} width="max" />
          {process.active_version && <>
            <Text color="secondary">Деактивация сохраняет версию в истории. Для изменения схемы создайте новую версию.</Text>
            <Button view="outlined-danger" disabled={mutation.isPending} onClick={() => mutation.mutate('deactivate')}>Деактивировать</Button>
          </>}
          <Text variant="subheader-2">Версии</Text>
          {versions.map((version) => <div key={version.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
            <Text>v{version.version_number}{version.status === 'active' ? ' · Активна' : ''}</Text>
            {version.status !== 'active' && versions.length > 1 && <DeleteEntityButton kind="process_version" id={version.id}
              name={`${process.name} · v${version.version_number}`} />}
          </div>)}
          <Text color="secondary">Активную и последнюю версии удалить нельзя. Удалённые версии доступны в корзине.</Text>
          <DeleteEntityButton kind="process" id={process.id} name={process.name} onDeleted={() => navigate(routes.processes)} />
          {mutation.isError && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
        </div>
      </Dialog.Body>
      <Dialog.Footer textButtonApply="Сохранить" textButtonCancel="Закрыть" loading={mutation.isPending}
        propsButtonApply={{disabled: process.archived || !name.trim()}}
        onClickButtonApply={() => mutation.mutate('save')} onClickButtonCancel={() => setOpen(false)} />
    </Dialog>
  </>;
}

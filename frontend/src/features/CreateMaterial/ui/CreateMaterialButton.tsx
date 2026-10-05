import {Button, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {
  createMaterial,
  emptyMaterialForm,
  materialKeys,
  MaterialForm,
  validateMaterialForm,
  type MaterialCreate,
  type MaterialFormValue,
  type Material,
} from '@/entities/Material';
import {getErrorMessage} from '@/shared/api';
import {inventoryGroupKeys} from '@/entities/InventoryGroup';
import {normalizeDecimal} from '@/shared/lib';

const titleId = 'create-material-title';

export function CreateMaterialButton({defaultGroupId = "", sourceMaterial}: {defaultGroupId?: string; sourceMaterial?: Material}) {
  const [open, setOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [form, setForm] = useState<MaterialFormValue>(emptyMaterialForm);
  const [validationError, setValidationError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: MaterialCreate) => createMaterial(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: materialKeys.all});
      await queryClient.invalidateQueries({queryKey: inventoryGroupKeys.all});
      setOpen(false);
      setForm(emptyMaterialForm);
      setValidationError(undefined);
    },
  });

  const close = () => {
    if (!mutation.isPending) {
      setOpen(false);
      setValidationError(undefined);
      mutation.reset();
    }
  };

  const submit = () => {
    if (imageBusy || mutation.isPending) return;
    if (form.isDefect && !form.sourceMaterialId) {setValidationError('Выберите исходный материал'); return;}
    const error = validateMaterialForm(form, true);
    if (error) {
      setValidationError(error);
      return;
    }
    const payload: MaterialCreate = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      initial_quantity: normalizeDecimal(form.initialQuantity),
      price: form.price ? normalizeDecimal(form.price) : null,
      url: form.url || null,
      image: form.image || null,
      group_ids: form.groupIds,
      ...(form.isDefect ? {source_material_id: form.sourceMaterialId} : {}),
    };
    setValidationError(undefined);
    mutation.mutate(payload);
  };

  return (
    <>
      <Button view={sourceMaterial ? 'outlined' : 'action'} size="l" onClick={() => {setForm(sourceMaterial ? {...emptyMaterialForm, isDefect: true, sourceMaterialId: sourceMaterial.id, unit: sourceMaterial.unit, price: sourceMaterial.price ?? '', url: sourceMaterial.url ?? '', image: sourceMaterial.image ?? '', groupIds: sourceMaterial.groups?.map((g) => g.id) ?? []} : {...emptyMaterialForm, groupIds: defaultGroupId ? [defaultGroupId] : []}); setValidationError(undefined); mutation.reset(); setOpen(true);}}>
        {sourceMaterial ? 'Новый брак' : 'Создать материал'}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onEnterKeyDown={submit}
        aria-labelledby={titleId}
        maxWidth="m"
        fullWidth
      >
        <Dialog.Header caption={sourceMaterial ? `Новый брак: ${sourceMaterial.name}` : 'Новый материал'} id={titleId} />
        <Dialog.Body>
          <MaterialForm onImageBusyChange={setImageBusy}
            value={form}
            onChange={setForm}
            includeInitialQuantity
            fixedSource={Boolean(sourceMaterial)}
            error={validationError ?? (mutation.error ? getErrorMessage(mutation.error) : undefined)}
          />
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Создать"
          textButtonCancel="Отмена"
          onClickButtonApply={submit}
          onClickButtonCancel={close}
          loading={mutation.isPending}
          propsButtonApply={{disabled: imageBusy}}
        />
      </Dialog>
    </>
  );
}

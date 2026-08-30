import {Alert, Select, Switch, TextInput} from '@gravity-ui/uikit';

import {measurementUnitOptions} from '@/shared/lib';
import {ImageUploadField} from '@/shared/ui';
import {useInventoryGroupsQuery} from '@/entities/InventoryGroup';

import type {ManufacturedItemFormValue} from '../model/types';
import styles from './ManufacturedItemForm.module.scss';

interface ManufacturedItemFormProps {
  value: ManufacturedItemFormValue;
  onChange: (value: ManufacturedItemFormValue) => void;
  includeInitialQuantity?: boolean;
  error?: string | undefined;
}

export function ManufacturedItemForm({
  value,
  onChange,
  includeInitialQuantity = false,
  error,
}: ManufacturedItemFormProps) {
  const groupsQuery = useInventoryGroupsQuery();
  const update = <K extends keyof ManufacturedItemFormValue>(
    field: K,
    fieldValue: ManufacturedItemFormValue[K],
  ) => onChange({...value, [field]: fieldValue});

  return (
    <div className={styles.root}>
      {error ? <Alert theme="danger" message={error} /> : null}
      <TextInput
        label="Название"
        value={value.name}
        onUpdate={(next) => update('name', next)}
        controlProps={{'aria-label': 'Название производимой позиции'}}
        autoFocus
        size="l"
      />
      <Switch
        size="l"
        checked={value.isProduct}
        onUpdate={(next) =>
          onChange({...value, isProduct: next, groupIds: next ? [] : value.groupIds})
        }
      >
        Готовый продукт
      </Switch>
      {!value.isProduct ? (
        <Select
          label="Группы"
          options={(groupsQuery.data ?? []).map((group) => ({
            value: group.id,
            content: group.name,
          }))}
          value={value.groupIds}
          onUpdate={(next) => update('groupIds', next)}
          multiple
          hasClear
          filterable
          placeholder="Без группы"
          aria-label="Группы полуфабриката"
          width="max"
          size="l"
        />
      ) : null}
      <Select
        label="Единица"
        options={measurementUnitOptions}
        value={value.unit ? [value.unit] : []}
        onUpdate={(next) => update('unit', next[0] ?? '')}
        aria-label="Единица измерения производимой позиции"
        width="max"
        size="l"
      />
      {includeInitialQuantity ? (
        <TextInput
          label="Начальный остаток"
          value={value.initialQuantity}
          onUpdate={(next) => update('initialQuantity', next)}
          controlProps={{
            'aria-label': 'Начальный остаток производимой позиции',
            inputMode: 'decimal',
          }}
          size="l"
        />
      ) : null}
      <ImageUploadField
        value={value.image}
        onUpdate={(next) => update('image', next)}
        alt="Предпросмотр производимой позиции"
      />
    </div>
  );
}

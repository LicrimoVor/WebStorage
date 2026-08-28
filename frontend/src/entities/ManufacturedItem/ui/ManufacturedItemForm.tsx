import {Alert, Switch, TextInput} from '@gravity-ui/uikit';

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
        onUpdate={(next) => update('isProduct', next)}
      >
        Готовый продукт
      </Switch>
      <TextInput
        label="Единица"
        value={value.unit}
        onUpdate={(next) => update('unit', next)}
        controlProps={{'aria-label': 'Единица измерения производимой позиции'}}
        placeholder="шт., кг, м"
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
      <TextInput
        label="Изображение"
        value={value.image}
        onUpdate={(next) => update('image', next)}
        controlProps={{'aria-label': 'Ссылка на изображение производимой позиции'}}
        placeholder="https://…"
        size="l"
      />
      {value.image ? (
        <img className={styles.preview} src={value.image} alt="Предпросмотр" />
      ) : null}
    </div>
  );
}

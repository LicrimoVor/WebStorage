import {Alert, Select, TextInput} from '@gravity-ui/uikit';

import {measurementUnitOptions} from '@/shared/lib';
import {ImageUploadField} from '@/shared/ui';

import type {MaterialFormValue} from '../model/types';
import styles from './MaterialForm.module.scss';

interface MaterialFormProps {
  value: MaterialFormValue;
  onChange: (value: MaterialFormValue) => void;
  includeInitialQuantity?: boolean;
  error?: string | undefined;
}

export function MaterialForm({
  value,
  onChange,
  includeInitialQuantity = false,
  error,
}: MaterialFormProps) {
  const update = (field: keyof MaterialFormValue, fieldValue: string) => {
    onChange({...value, [field]: fieldValue});
  };

  return (
    <div className={styles.root}>
      {error ? <Alert theme="danger" message={error} /> : null}
      <TextInput
        label="Название"
        value={value.name}
        onUpdate={(next) => update('name', next)}
        controlProps={{'aria-label': 'Название материала'}}
        autoFocus
        size="l"
      />
      <Select
        label="Единица"
        options={measurementUnitOptions}
        value={value.unit ? [value.unit] : []}
        onUpdate={(next) => update('unit', next[0] ?? '')}
        aria-label="Единица измерения"
        width="max"
        size="l"
      />
      {includeInitialQuantity ? (
        <TextInput
          label="Начальный остаток"
          value={value.initialQuantity}
          onUpdate={(next) => update('initialQuantity', next)}
          controlProps={{'aria-label': 'Начальный остаток', inputMode: 'decimal'}}
          size="l"
        />
      ) : null}
      <TextInput
        label="Цена, ₽"
        value={value.price}
        onUpdate={(next) => update('price', next)}
        controlProps={{'aria-label': 'Цена', inputMode: 'decimal'}}
        placeholder="Не указана"
        size="l"
      />
      <TextInput
        label="Ссылка"
        value={value.url}
        onUpdate={(next) => update('url', next)}
        controlProps={{'aria-label': 'Ссылка на материал'}}
        placeholder="https://…"
        size="l"
      />
      <ImageUploadField
        value={value.image}
        onUpdate={(next) => update('image', next)}
        alt="Предпросмотр материала"
      />
    </div>
  );
}

import {Alert, TextInput} from '@gravity-ui/uikit';

import type {OperationFormValue} from '../model/types';
import styles from './OperationForm.module.scss';

interface OperationFormProps {
  value: OperationFormValue;
  onChange: (value: OperationFormValue) => void;
  error?: string | undefined;
}

export function OperationForm({value, onChange, error}: OperationFormProps) {
  const update = (field: keyof OperationFormValue, fieldValue: string) => {
    onChange({...value, [field]: fieldValue});
  };
  return (
    <div className={styles.root}>
      {error ? <Alert theme="danger" message={error} /> : null}
      <TextInput
        label="Название"
        value={value.name}
        onUpdate={(next) => update('name', next)}
        controlProps={{'aria-label': 'Название операции'}}
        autoFocus
        size="l"
      />
      <TextInput
        label="Норма времени, минут на операцию"
        value={value.timeNorm}
        onUpdate={(next) => update('timeNorm', next)}
        controlProps={{'aria-label': 'Норма времени операции', inputMode: 'decimal'}}
        placeholder="Не указана"
        size="l"
      />
      <TextInput
        label="Ставка, ₽ за операцию"
        value={value.pricePerOperation}
        onUpdate={(next) => update('pricePerOperation', next)}
        controlProps={{'aria-label': 'Ставка за операцию', inputMode: 'decimal'}}
        placeholder="Не указана"
        size="l"
      />
    </div>
  );
}

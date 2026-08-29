import {Alert, Select, TextArea, TextInput} from '@gravity-ui/uikit';

import type {EmployeeFormValue} from '../model/types';
import styles from './EmployeeForm.module.scss';

interface EmployeeFormProps {
  value: EmployeeFormValue;
  onChange: (value: EmployeeFormValue) => void;
  error?: string | undefined;
}

export function EmployeeForm({value, onChange, error}: EmployeeFormProps) {
  return (
    <div className={styles.root}>
      {error ? <Alert theme="danger" message={error} /> : null}
      <TextInput
        label="ФИО"
        value={value.fullName}
        onUpdate={(fullName) => onChange({...value, fullName})}
        controlProps={{'aria-label': 'ФИО сотрудника'}}
        autoFocus
        size="l"
      />
      <Select
        label="Тип оплаты"
        options={[
          {value: 'piecework', content: 'Сдельная — за выполненные операции'},
          {value: 'hourly', content: 'Почасовая — за затраченное время'},
        ]}
        value={[value.compensationType]}
        onUpdate={(values) =>
          onChange({
            ...value,
            compensationType: values[0] === 'hourly' ? 'hourly' : 'piecework',
            hourlyRate: values[0] === 'hourly' ? value.hourlyRate : '',
          })
        }
        width="max"
        size="l"
        aria-label="Тип оплаты сотрудника"
      />
      {value.compensationType === 'hourly' ? (
        <TextInput
          label="Ставка в час, ₽"
          value={value.hourlyRate}
          onUpdate={(hourlyRate) => onChange({...value, hourlyRate})}
          controlProps={{'aria-label': 'Почасовая ставка', inputMode: 'decimal'}}
          placeholder="0,00"
          size="l"
        />
      ) : null}
      <TextArea
        value={value.comment}
        onUpdate={(comment) => onChange({...value, comment})}
        controlProps={{'aria-label': 'Комментарий сотрудника'}}
        placeholder="Комментарий"
        minRows={3}
        maxRows={8}
        size="l"
      />
    </div>
  );
}

import {Alert, TextArea, TextInput} from '@gravity-ui/uikit';

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

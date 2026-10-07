import {TextInput as BaseInput, type TextInputProps} from '@gravity-ui/uikit';
import {useId} from 'react';
import styles from './FormControls.module.scss';

export function TextInput({label, className, ...props}: TextInputProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return <div className={`${styles.field} ${className ?? ''}`}>
    {label && <label className={styles.label} htmlFor={id}>{label}</label>}
    <BaseInput size="l" {...props} id={id} />
  </div>;
}


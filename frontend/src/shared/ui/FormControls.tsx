import {Select as BaseSelect, TextArea as BaseArea, type SelectProps, type TextAreaProps} from '@gravity-ui/uikit';
import {useId} from 'react';
import styles from './FormControls.module.scss';

export {TextInput} from './TextInput';

export function TextArea({label, className, ...props}: TextAreaProps & {label?: string}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return <div className={`${styles.field} ${className ?? ''}`}>
    {label && <label className={styles.label} htmlFor={id}>{label}</label>}
    <BaseArea size="l" {...props} id={id} />
  </div>;
}

export function Select<T = unknown>({label, className, popupClassName, sheetClassName, ...props}: SelectProps<T>) {
  const id = useId();
  const count = props.options?.reduce((total, option) => total + ('options' in option ? option.options?.length ?? 0 : 1), 0) ?? 0;
  return <div className={`${styles.field} ${className ?? ''}`}>
    {label && <span id={id} className={styles.label}>{label}</span>}
    <BaseSelect size="l" width="max" filterable={count > 7} filterPlaceholder="Найти в списке…"
      {...(label && !props['aria-label'] ? {'aria-labelledby': id} : {})} {...props}
      popupClassName={`${styles.popup} ${popupClassName ?? ''}`} sheetClassName={`${styles.sheet} ${sheetClassName ?? ''}`} />
  </div>;
}

import {Alert, Button, Icon} from '@gravity-ui/uikit';
import {Plus, TrashBin} from '@gravity-ui/icons';
import {Select, TextInput} from '@/shared/ui/FormControls';
import {formatMoney} from '@/shared/lib';
import type {useFundingSplit} from './split';
import {useFundingSources} from './api';
import styles from './FundingSplit.module.scss';

export function FundingSplit({split, primary}: {split: ReturnType<typeof useFundingSplit>; primary: string}) {
  const sources = useFundingSources();
  const options = (sources.data ?? []).filter((source) => !source.archived).map((source) => ({value: source.id, content: source.name}));
  return <div className={styles.root}>
    {split.parts.length > 0 && <p>Из основного источника: <strong>{Number.isFinite(split.remaining) && split.remaining >= 0 ? formatMoney((split.remaining / 100).toFixed(2)) : '—'}</strong>. Остаток рассчитывается автоматически.</p>}
    {split.parts.map((part, index) => <div key={index} className={styles.part}>
      <Select label={`Дополнительный источник ${index + 1}`} placeholder="Выберите источник" value={part.funding_source_id ? [part.funding_source_id] : []} options={options.filter((option) => option.value !== primary && !split.parts.some((other, i) => i !== index && other.funding_source_id === option.value))}
        onUpdate={(ids) => split.setParts(split.parts.map((item, i) => i === index ? {...item, funding_source_id: ids[0] ?? ''} : item))} />
      <TextInput label="Сумма из источника" placeholder="0,00" value={part.amount} onUpdate={(amount) => split.setParts(split.parts.map((item, i) => i === index ? {...item, amount} : item))} controlProps={{inputMode: 'decimal'}} />
      <Button aria-label={`Убрать источник ${index + 1}`} onClick={() => split.setParts(split.parts.filter((_, i) => i !== index))}><Icon data={TrashBin} /></Button>
    </div>)}
    <Button view="flat" disabled={split.parts.length >= options.length - 1} onClick={() => split.setParts([...split.parts, {funding_source_id: '', amount: ''}])}><Icon data={Plus} />Добавить источник к оплате</Button>
    {!split.valid && <Alert theme="warning" message="Выберите разные источники и укажите суммы. Их сумма не должна превышать общую сумму операции." />}
  </div>;
}

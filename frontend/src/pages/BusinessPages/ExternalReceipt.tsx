import {Alert, Button, Loader} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useRef, useState} from 'react';
import {externalKeys, useExternalOffersQuery} from '@/entities/External';
import {FundingSelect} from '@/entities/Funding';
import {FundingSplit} from '@/entities/Funding/FundingSplit';
import {fundingTotal, useFundingSplit} from '@/entities/Funding/split';
import {useMaterialsQuery} from '@/entities/Material';
import {apiRequest, getErrorMessage} from '@/shared/api';
import {formatDecimal, isDecimal, normalizeDecimal} from '@/shared/lib';
import {Select, TextArea, TextInput} from '@/shared/ui/FormControls';
import {History} from './History';
import styles from './BusinessPages.module.scss';

function materialTotal(quantity: string, rate: string): string {
  if (!isDecimal(quantity) || !isDecimal(rate)) return '—';
  const scaled = (value: string) => {const [whole, fraction = ''] = normalizeDecimal(value).split('.'); return BigInt(whole! + fraction.padEnd(6, '0'));};
  const total = (scaled(quantity) * scaled(rate) + 500000n) / 1000000n;
  return `${total / 1000000n}.${String(total % 1000000n).padStart(6, '0')}`;
}

export function ExternalReceipt() {
  const offers = useExternalOffersQuery();
  const materials = useMaterialsQuery({page: 1, page_size: 100, sort_by: 'name', sort_order: 'asc'}, true);
  const [offerId, setOfferId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [source, setSource] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const key = useRef(crypto.randomUUID());
  const offer = offers.data?.find((entry) => entry.id === offerId && entry.active);
  const total = offer ? fundingTotal(quantity, offer.money_cost) : '';
  const split = useFundingSplit(total, source);
  const client = useQueryClient();
  const mutation = useMutation({mutationFn: () => apiRequest('/external-receipts', {method: 'POST',
    headers: {'Idempotency-Key': key.current}, body: JSON.stringify({offer_id: offerId, quantity: normalizeDecimal(quantity),
      funding_source_id: source, occurred_at: new Date(date).toISOString(), comment, ...split.payload})}),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({queryKey: externalKeys}), client.invalidateQueries({queryKey: ['materials']}),
        client.invalidateQueries({queryKey: ['manufactured-items']}), client.invalidateQueries({queryKey: ['stock-revision']}),
        client.invalidateQueries({queryKey: ['finance']}), client.invalidateQueries({queryKey: ['business-documents']}),
        client.invalidateQueries({queryKey: ['production-plans']})]);
      key.current = crypto.randomUUID(); setOfferId(''); setQuantity('1'); setComment(''); split.reset();
    }});
  const valid = offer && source && date && isDecimal(quantity) && Number(normalizeDecimal(quantity)) > 0 && split.valid;
  return <>
    <section className={styles.form}>
      <h2>Получить полуфабрикат извне</h2>
      {offers.isPending && <Loader />}
      {offers.isError && <Alert theme="danger" message={getErrorMessage(offers.error)} />}
      {offers.data && !offers.data.some((entry) => entry.active) && <Alert theme="info" message="Добавьте исполнителей и их полуфабрикаты в разделе «Персонал → Внешние»." />}
      <Select label="Полуфабрикат и внешний исполнитель" aria-label="Полуфабрикат извне" width="max" filterable
        value={offerId ? [offerId] : []} onUpdate={(ids) => {setOfferId(ids[0] ?? ''); mutation.reset();}}
        options={(offers.data ?? []).filter((entry) => entry.active).map((entry) => ({value: entry.id, content: `${entry.item_name} — ${entry.provider_name}`}))} />
      <TextInput label={`Количество${offer ? `, ${offer.unit}` : ''}`} value={quantity} onUpdate={setQuantity}
        controlProps={{inputMode: 'decimal', 'aria-label': 'Количество внешнего полуфабриката'}} />
      {offer && <>
        <p>Техпроцесс: <b>{offer.process_name}</b>. Операции не регистрируются.</p>
        <p>Денежный расход: <b>{total ? formatDecimal(total) : '—'} ₽</b> ({formatDecimal(offer.money_cost)} ₽ за 1 {offer.unit}).</p>
        {offer.materials.length ? <><h3>Будут списаны материалы</h3><ul>{offer.materials.map((line) => {
          const material = materials.data?.items.find((entry) => entry.id === line.material_id);
          return <li key={line.material_id}>{material?.name ?? 'Материал'}: {formatDecimal(materialTotal(quantity, line.quantity))} {material?.unit}</li>;
        })}</ul></> : <p>Материалы не расходуются.</p>}
      </>}
      <FundingSelect value={source} onChange={setSource} />
      <FundingSplit split={split} primary={source} />
      <TextInput label="Дата и время" value={date} onUpdate={setDate} controlProps={{type: 'datetime-local'}} />
      <TextArea label="Комментарий" value={comment} onUpdate={setComment} />
      <Button view="action" disabled={!valid || offers.isError} loading={mutation.isPending} onClick={() => mutation.mutate()}>Получить извне</Button>
      {mutation.error && <Alert theme="danger" message={getErrorMessage(mutation.error)} />}
      {mutation.isSuccess && <Alert theme="success" message="Полуфабрикат оприходован, расходы записаны" />}
    </section>
    <History kind="external_receipt" />
  </>;
}

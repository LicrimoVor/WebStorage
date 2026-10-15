import {Alert, Button, Dialog, Loader, MobileProvider, Text} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {externalKeys, saveExternalOffer, saveExternalProvider, useExternalOffersQuery, useExternalProvidersQuery, type ExternalOffer, type ExternalProvider} from '@/entities/External';
import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import {apiRequest, getErrorMessage} from '@/shared/api';
import type {TechnologicalProcessList} from '@/entities/TechnologicalProcess/model/types';
import {formatDecimal} from '@/shared/lib';
import {Select, TextInput} from '@/shared/ui/FormControls';
import {useQuery} from '@tanstack/react-query';
import styles from './ExternalProviders.module.scss';
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';

export function ExternalProviders() {
  const providers = useExternalProvidersQuery();
  const offers = useExternalOffersQuery();
  const client = useQueryClient();
  const [selected, setSelected] = useState<ExternalProvider | {name: string}>();
  const refresh = async () => {await client.invalidateQueries({queryKey: externalKeys});};
  return <MobileProvider mobile={false}><section className={styles.root}>
    <div className={styles.heading}><Text as="h2" variant="header-2">Внешние</Text>
      <Button view="action" onClick={() => setSelected({name: ''})}>Добавить внешнего</Button></div>
    {providers.isPending && <Loader />}
    {(offers.error || providers.error) && <Alert theme="danger" message={getErrorMessage(offers.error ?? providers.error)} />}
    {providers.data?.length === 0 && <Text color="secondary">Внешние исполнители пока не добавлены.</Text>}
    {!!providers.data?.length && <table className={styles.table}>
      <thead><tr><th>Название</th><th>Техпроцессы</th></tr></thead>
      <tbody>{providers.data.map((provider) => <tr key={provider.id} tabIndex={0} className={styles.clickableRow}
        onClick={() => setSelected(provider)} onKeyDown={(event) => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); setSelected(provider);}}}>
        <td>{provider.name}</td><td>{offers.data?.filter((offer) => offer.provider_id === provider.id && offer.active).map((offer) => offer.process_name).join(', ') || '—'}</td>
      </tr>)}</tbody>
    </table>}
    {selected && <ProviderDialog key={'id' in selected ? selected.id : 'new'} provider={selected}
      offers={offers.data?.filter((offer) => 'id' in selected && offer.provider_id === selected.id) ?? []}
      onClose={() => setSelected(undefined)} onSaved={refresh} onCreated={setSelected} />}
  </section></MobileProvider>;
}

function ProviderDialog({provider, offers, onClose, onSaved, onCreated}: {
  provider: ExternalProvider | {name: string}; offers: ExternalOffer[]; onClose: () => void;
  onSaved: () => Promise<void>; onCreated: (provider: ExternalProvider) => void;
}) {
  const providerId = 'id' in provider ? provider.id : undefined;
  const [name, setName] = useState(provider.name);
  const [processId, setProcessId] = useState('');
  const [offerId, setOfferId] = useState<string>();
  const processes = useQuery({queryKey: ['external-process-options'], queryFn: async ({signal}) => {
    const items: TechnologicalProcessList['items'] = [];
    for (let page = 1; ; page++) {
      const result = await apiRequest<TechnologicalProcessList>(`/technological-processes?page=${page}&page_size=100`, {signal});
      items.push(...result.items);
      if (page >= result.pages) return items;
    }
  }, enabled: Boolean(providerId)});
  const items = useManufacturedItemsQuery({kind: 'semi_finished', page: 1, page_size: 100, sort_by: 'name', sort_order: 'asc'}, true);
  const saveName = useMutation({mutationFn: () => saveExternalProvider(name.trim(), providerId),
    onSuccess: async (value) => {await onSaved(); if (!providerId) onCreated(value);}});
  const mutation = useMutation({mutationFn: () => saveExternalOffer({provider_id: providerId!, process_id: processId, active: true}, offerId),
    onSuccess: async () => {await onSaved(); setProcessId(''); setOfferId(undefined);}});
  const toggle = useMutation({mutationFn: (offer: ExternalOffer) => saveExternalOffer({provider_id: offer.provider_id, process_id: offer.process_id, active: !offer.active}, offer.id), onSuccess: onSaved});
  const busy = saveName.isPending || mutation.isPending || toggle.isPending;
  const options = (processes.data ?? []).filter((process) => process.active_version && items.data?.items.some((item) => item.id === process.output_item_id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return <Dialog open onClose={() => !busy && onClose()} maxWidth="l" fullWidth>
    <Dialog.Header caption={providerId ? `Внешний исполнитель: ${provider.name}` : 'Новый внешний исполнитель'} />
    <Dialog.Body className={styles.dialog}>
      <TextInput label="Название" value={name} onUpdate={setName} controlProps={{'aria-label': 'Название внешнего исполнителя', maxLength: 200}} />
      <Button disabled={!name.trim()} loading={saveName.isPending} onClick={() => saveName.mutate()}>{providerId ? 'Сохранить название' : 'Создать исполнителя'}</Button>
      {providerId && <>
        <Text as="h3" variant="subheader-2">Техпроцессы исполнителя</Text>
        {offers.map((offer) => <div className={styles.offer} key={offer.id}>
          <div><b>{offer.process_name}</b><p>{offer.item_name} · {formatDecimal(offer.money_cost)} ₽ за 1 {offer.unit}{!offer.active && ' · Неактивно'}</p></div>
          <div className={styles.row}><Button onClick={() => {setOfferId(offer.id); setProcessId(offer.process_id); mutation.reset();}}>Изменить техпроцесс</Button>
            <Button disabled={!offer.process_version_id} loading={toggle.isPending} onClick={() => toggle.mutate(offer)}>{offer.active ? 'Деактивировать' : 'Активировать'}</Button>
            <DeleteEntityButton kind="external_offer" id={offer.id} name={offer.process_name} label="Удалить техпроцесс"
              onDeleted={() => {if (offerId === offer.id) {setOfferId(undefined); setProcessId('');} mutation.reset(); toggle.reset();}} /></div>
        </div>)}
        <Select disablePortal label="Техпроцесс" aria-label="Техпроцесс внешнего исполнителя" filterable width="max"
          loading={processes.isPending || items.isPending} value={processId ? [processId] : []} onUpdate={(ids) => setProcessId(ids[0] ?? '')}
          options={options.map((process) => ({value: process.id, content: `${process.name} — ${process.output_item_name}`}))} />
        <Text color="secondary">Материалы и стоимость рассчитываются по выбранной активной версии техпроцесса. Операции не регистрируются.</Text>
        <Button view="action" disabled={!processId} loading={mutation.isPending} onClick={() => mutation.mutate()}>{offerId ? 'Сохранить техпроцесс' : 'Добавить техпроцесс'}</Button>
      </>}
      {(saveName.error || mutation.error || toggle.error || processes.error || items.error) && <Alert theme="danger" message={getErrorMessage(saveName.error ?? mutation.error ?? toggle.error ?? processes.error ?? items.error)} />}
    </Dialog.Body>
    <Dialog.Footer>
      <div className={styles.row}>
        {providerId && <DeleteEntityButton kind="external_provider" id={providerId} name={provider.name} label="Удалить исполнителя" onDeleted={onClose} />}
        <Button disabled={busy} onClick={onClose}>Закрыть</Button>
      </div>
    </Dialog.Footer>
  </Dialog>;
}

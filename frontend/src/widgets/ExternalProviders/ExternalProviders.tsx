import {Alert, Button, Dialog, Loader, MobileProvider, Text} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {externalKeys, saveExternalOffer, saveExternalProvider, useExternalOffersQuery, useExternalProvidersQuery, type ExternalOffer, type ExternalProvider} from '@/entities/External';
import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import {useMaterialsQuery} from '@/entities/Material';
import {getErrorMessage} from '@/shared/api';
import {formatDecimal, isDecimal, normalizeDecimal} from '@/shared/lib';
import {Select, TextInput} from '@/shared/ui/FormControls';
import styles from './ExternalProviders.module.scss';

export function ExternalProviders() {
  const providers = useExternalProvidersQuery();
  const offers = useExternalOffersQuery();
  const client = useQueryClient();
  const [nameDialog, setNameDialog] = useState<{id?: string; name: string}>();
  const [selected, setSelected] = useState<ExternalProvider>();
  const refresh = async () => {await Promise.all([client.invalidateQueries({queryKey: externalKeys}), client.invalidateQueries({queryKey: ['operations']})]);};
  const saveName = useMutation({mutationFn: () => saveExternalProvider(nameDialog!.name.trim(), nameDialog!.id),
    onSuccess: async () => {await refresh(); setNameDialog(undefined);}});
  return <MobileProvider mobile={false}><section className={styles.root}>
    <div className={styles.heading}><Text as="h2" variant="header-2">Внешние</Text>
      <Button view="action" onClick={() => {saveName.reset(); setNameDialog({name: ''});}}>Добавить внешнего</Button></div>
    {providers.isPending && <Loader />}
    {offers.isError && <Alert theme="danger" message={getErrorMessage(offers.error)} />}
    {providers.isError && <Alert theme="danger" message={getErrorMessage(providers.error)} />}
    {providers.data?.length === 0 && <Text color="secondary">Внешние исполнители пока не добавлены.</Text>}
    {!!providers.data?.length && <table className={styles.table}>
      <thead><tr><th>Название</th><th>Полуфабрикаты</th><th>Действия</th></tr></thead>
      <tbody>{providers.data.map((provider) => <tr key={provider.id}><td>{provider.name}</td>
        <td>{offers.data?.filter((offer) => offer.provider_id === provider.id && offer.active).map((offer) => offer.item_name).join(', ') || '—'}</td>
        <td><div className={styles.row}><Button onClick={() => {saveName.reset(); setNameDialog({id: provider.id, name: provider.name});}}>Изменить</Button>
          <Button onClick={() => setSelected(provider)}>Настроить п/ф</Button></div></td></tr>)}</tbody>
    </table>}
    <Dialog open={Boolean(nameDialog)} onClose={() => !saveName.isPending && setNameDialog(undefined)}>
      <Dialog.Header caption={nameDialog?.id ? 'Изменить внешнего исполнителя' : 'Новый внешний исполнитель'} />
      <Dialog.Body><TextInput label="Название" value={nameDialog?.name ?? ''} onUpdate={(name) => setNameDialog({...nameDialog, name})}
        controlProps={{'aria-label': 'Название внешнего исполнителя', maxLength: 200}} />
        {saveName.error && <Alert theme="danger" message={getErrorMessage(saveName.error)} />}</Dialog.Body>
      <Dialog.Footer textButtonApply="Сохранить" textButtonCancel="Закрыть" loading={saveName.isPending}
        propsButtonApply={{disabled: !nameDialog?.name.trim()}} propsButtonCancel={{disabled: saveName.isPending}}
        onClickButtonApply={() => saveName.mutate()} onClickButtonCancel={() => setNameDialog(undefined)} />
    </Dialog>
    {selected && <ProviderOffers provider={selected} offers={offers.data?.filter((offer) => offer.provider_id === selected.id) ?? []}
      onClose={() => setSelected(undefined)} onSaved={refresh} />}
  </section></MobileProvider>;
}

function ProviderOffers({provider, offers, onClose, onSaved}: {provider: ExternalProvider; offers: ExternalOffer[]; onClose: () => void; onSaved: () => Promise<void>}) {
  const items = useManufacturedItemsQuery({kind: 'semi_finished', page: 1, page_size: 100, sort_by: 'name', sort_order: 'asc'}, true);
  const materials = useMaterialsQuery({page: 1, page_size: 100, sort_by: 'name', sort_order: 'asc'}, true);
  const [offerId, setOfferId] = useState<string>();
  const [itemId, setItemId] = useState('');
  const [cost, setCost] = useState('0');
  const [materialId, setMaterialId] = useState('');
  const [lines, setLines] = useState<Record<string, string>>({});
  const reset = () => {setOfferId(undefined); setItemId(''); setCost('0'); setLines({}); setMaterialId('');};
  const valid = itemId && /^\d+(?:[.,]\d{1,2})?$/.test(cost.trim()) && isDecimal(cost) && Number(normalizeDecimal(cost)) >= 0 &&
    Object.values(lines).every((quantity) => isDecimal(quantity) && Number(normalizeDecimal(quantity)) > 0);
  const mutation = useMutation({mutationFn: () => saveExternalOffer({provider_id: provider.id, item_id: itemId,
    money_cost: normalizeDecimal(cost), materials: Object.entries(lines).map(([material_id, quantity]) => ({material_id, quantity: normalizeDecimal(quantity)})), active: offers.find((offer) => offer.id === offerId)?.active ?? true}, offerId),
    onSuccess: async () => {await onSaved(); reset();}});
  const toggle = useMutation({mutationFn: (offer: ExternalOffer) => saveExternalOffer({...offer, active: !offer.active}, offer.id), onSuccess: onSaved});
  return <Dialog open onClose={() => !mutation.isPending && !toggle.isPending && onClose()} maxWidth="l" fullWidth>
    <Dialog.Header caption={`Внешние: ${provider.name}`} />
    <Dialog.Body className={styles.dialog}>
      {offers.map((offer) => <div className={styles.offer} key={offer.id}>
        <div><b>{offer.item_name}</b><p>{formatDecimal(offer.money_cost)} ₽ за 1 {offer.unit} · {offer.materials.length} материалов{!offer.active && ' · Неактивно'}</p></div>
        <div className={styles.row}><Button onClick={() => {setOfferId(offer.id); setItemId(offer.item_id); setCost(offer.money_cost); setLines(Object.fromEntries(offer.materials.map((line) => [line.material_id, line.quantity]))); mutation.reset();}}>Изменить условия</Button>
          <Button loading={toggle.isPending} onClick={() => toggle.mutate(offer)}>{offer.active ? 'Деактивировать' : 'Активировать'}</Button></div>
      </div>)}
      <Text as="h3" variant="subheader-2">{offerId ? 'Изменить условия' : 'Прикрепить полуфабрикат'}</Text>
      <Text color="secondary">Расходы на 1 единицу. Деньги и материалы можно указать вместе.</Text>
      <Select disablePortal popupPlacement={["bottom-start", "bottom-end"]} popupWidth="fit" label="Полуфабрикат" aria-label="Внешний полуфабрикат" filterable width="max" disabled={Boolean(offerId)}
        value={itemId ? [itemId] : []} onUpdate={(ids) => setItemId(ids[0] ?? '')} loading={items.isPending}
        options={(items.data?.items ?? []).filter((item) => item.id === itemId || !offers.some((offer) => offer.item_id === item.id)).map((item) => ({value: item.id, content: item.name}))} />
      <TextInput label="Деньги за 1 единицу, ₽" value={cost} onUpdate={setCost} controlProps={{inputMode: 'decimal', 'aria-label': 'Стоимость внешнего полуфабриката'}} />
      <div className={styles.row}><Select disablePortal popupPlacement={["bottom-start", "bottom-end"]} popupWidth="fit" label="Добавить материал" aria-label="Материал для внешнего исполнителя" filterable width="max"
        value={materialId ? [materialId] : []} onUpdate={(ids) => setMaterialId(ids[0] ?? '')}
        options={(materials.data?.items ?? []).filter((material) => !(material.id in lines)).map((material) => ({value: material.id, content: material.name}))} />
        <Button disabled={!materialId} onClick={() => {setLines({...lines, [materialId]: '1'}); setMaterialId('');}}>Добавить материал</Button></div>
      {Object.entries(lines).map(([id, quantity]) => <div className={styles.row} key={id}>
        <Text>{materials.data?.items.find((material) => material.id === id)?.name ?? 'Материал недоступен'}</Text>
        <TextInput label={`На 1 единицу, ${materials.data?.items.find((material) => material.id === id)?.unit ?? ''}`} value={quantity}
          onUpdate={(value) => setLines({...lines, [id]: value})} controlProps={{inputMode: 'decimal', 'aria-label': `Расход: ${materials.data?.items.find((material) => material.id === id)?.name ?? 'Материал'}`}} />
        <Button view="flat-danger" onClick={() => setLines(Object.fromEntries(Object.entries(lines).filter(([key]) => key !== id)))}>Убрать</Button></div>)}
      {(mutation.error || toggle.error || items.error || materials.error) && <Alert theme="danger" message={getErrorMessage(mutation.error ?? toggle.error ?? items.error ?? materials.error)} />}
      <div className={styles.row}><Button view="action" disabled={!valid} loading={mutation.isPending} onClick={() => mutation.mutate()}>Сохранить условия</Button>
        {offerId && <Button onClick={reset}>Новые условия</Button>}</div>
    </Dialog.Body>
    <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={onClose} propsButtonCancel={{disabled: mutation.isPending || toggle.isPending}} />
  </Dialog>;
}

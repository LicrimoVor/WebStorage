import {auditTitle, auditEntity, auditResult, auditValue, fieldLabels} from './presentation';
import {Select, TextInput} from '@/shared/ui/FormControls';
import {Alert, Button, Dialog, Pagination, Table, Text, type TableColumnConfig} from '@gravity-ui/uikit';
import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';

import {useAuditEventsQuery, type AuditEvent, type AuditParams} from '@/entities/Audit';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime} from '@/shared/lib';

import styles from './AuditPage.module.scss';

const actionLabels: Record<string, string> = {insert: 'Создание', update: 'Изменение', delete: 'Удаление', request: 'Действия пользователей'};
const actionOptions = [{value: '', content: 'Все события'}, ...Object.entries(actionLabels).map(([value, content]) => ({value, content}))];

function dateBoundary(value: string, end: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<AuditEvent>();
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = (params.get('search') ?? '').slice(0, 200);
  const rawAction = params.get('action') ?? '';
  const action = Object.hasOwn(actionLabels, rawAction) ? rawAction as AuditParams['action'] : undefined;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const dateFrom = dateBoundary(from, false);
  const dateTo = dateBoundary(to, true);
  const invalidDates = Boolean((from && !dateFrom) || (to && !dateTo) || (dateFrom && dateTo && dateFrom > dateTo));
  const rawThrough = Number(params.get('through'));
  const through = params.has('through') && Number.isSafeInteger(rawThrough) && rawThrough >= 0 ? rawThrough : null;
  const query = useAuditEventsQuery({page, search, action: action ?? null, date_from: dateFrom, date_to: dateTo, through_id: through}, !invalidDates);
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set(key, value);
    if (key !== 'page') {
      next.delete('page');
      next.delete('through');
    } else if (query.data) {
      next.set('through', String(query.data.through_id));
    }
    return next;
  }, {replace: true});
  const refresh = () => {
    if (params.has('through') || page !== 1) {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete('through');
        next.delete('page');
        return next;
      }, {replace: true});
    } else {
      void query.refetch();
    }
  };
  const columns: TableColumnConfig<AuditEvent>[] = [
    {id: 'created_at', name: 'Время', template: (item) => formatDateTime(item.created_at)},
    {id: 'actor', name: 'Пользователь'},
    {id: 'action', name: 'Событие', template: auditTitle},
    {id: 'entity', name: 'Раздел', template: auditEntity},
    {id: 'status_code', name: 'Результат', template: auditResult},
    {id: 'details', name: '', template: (item) => <Button onClick={() => setSelected(item)} aria-label={`Подробности события ${item.id}`}>Подробности</Button>},
  ];
  return (
    <main className={styles.root}>
      <header><Text as="h1" variant="display-1">Журнал событий</Text>
        <Text as="p" color="secondary">Изменения данных, входы, выгрузки и обращения к API. История сохраняется с момента включения журнала.</Text></header>
      <div className={styles.filters}>
        <TextInput value={search} onUpdate={(value) => update('search', value)} controlProps={{maxLength: 200}} hasClear
          aria-label="Поиск событий" placeholder="Пользователь, объект или ID запроса" />
        <Select value={[action ?? '']} options={actionOptions} onUpdate={(values) => update('action', values[0] ?? '')} aria-label="Тип события" />
        <label className={styles.date}>С даты<input type="date" value={from} onChange={(event) => update('from', event.target.value)} /></label>
        <label className={styles.date}>По дату<input type="date" value={to} onChange={(event) => update('to', event.target.value)} /></label>
        <Button disabled={invalidDates} loading={query.isFetching} onClick={refresh}>Обновить</Button>
      </div>
      {invalidDates && <Alert theme="warning" message="Укажите корректный период: дата начала не должна быть позже даты окончания." />}
      {query.isError && <Alert theme="danger" title="Журнал недоступен" message={getErrorMessage(query.error)} />}
      {query.isPending && !invalidDates && <Text role="status">Загрузка событий…</Text>}
      {query.data && !query.isError && !invalidDates && <>
        <Text color="secondary">Найдено событий: {query.data.total}</Text>
        <div className={styles.table}><Table columns={columns} data={query.data.items}
          getRowDescriptor={(item) => ({id: String(item.id)})} emptyMessage="Событий по выбранному фильтру нет." /></div>
        <Pagination page={page} pageSize={20} total={query.data.total} onUpdate={(value) => update('page', String(value))} />
      </>}
      <Dialog open={Boolean(selected)} onClose={() => setSelected(undefined)} size="l">
        <Dialog.Header caption={`Событие №${selected?.id ?? ''}`} />
        <Dialog.Body>{selected && <div className={styles.details}>
          <Text as="p">{selected.actor} · {formatDateTime(selected.created_at)}</Text>
          <Text as="h2" variant="header-1">{auditTitle(selected)}</Text>
          <Text as="p">{auditEntity(selected)} · {auditResult(selected)}</Text>
          {selected.action !== 'request' && <div className={styles.table}><table>
            <thead><tr><th>Поле</th><th>До</th><th>После</th></tr></thead>
            <tbody>{[...new Set([...Object.keys(selected.before ?? {}), ...Object.keys(selected.after ?? {})])].filter((key) => key !== 'updated_at' && JSON.stringify(selected.before?.[key]) !== JSON.stringify(selected.after?.[key])).map((key) => <tr key={key}>
              <th>{fieldLabels[key] ?? key.replaceAll('_', ' ')}</th><td>{auditValue(selected.before?.[key])}</td><td>{auditValue(selected.after?.[key])}</td>
            </tr>)}</tbody>
          </table></div>}
          <details><summary>Технические данные</summary><pre>{JSON.stringify(selected, null, 2)}</pre></details>
        </div>}</Dialog.Body>
        <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setSelected(undefined)} />
      </Dialog>
    </main>
  );
}

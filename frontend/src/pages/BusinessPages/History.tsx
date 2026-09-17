import {Alert, Button, Dialog, Loader} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';

import {useFundingSources} from '@/entities/Funding';
import {useStockRevisionRowsQuery} from '@/entities/StockRevision';
import {apiRequest, getErrorMessage} from '@/shared/api';
import styles from './BusinessPages.module.scss';

export interface Line {
  name?: string;
  material_id: string;
  quantity: string;
  defective_quantity?: string;
  unit_price?: string;
}
export interface OperationLine {operation_id: string; quantity: string}
export interface Document {
  id: string;
  created_at: string;
  occurred_at: string;
  comment: string;
  funding_source_id: string;
  serial_number?: string;
  replacement_serial_number?: string;
  service_cost?: string;
  materials?: Line[];
  material_costs?: Line[];
  operations?: OperationLine[];
  entries?: Line[];
  operation_snapshots?: {name: string; quantity: string; rate: string}[];
}

function DocumentDetails({document: doc}: {document: Document}) {
  const catalog = useStockRevisionRowsQuery({});
  const sources = useFundingSources();
  return <div className={styles.documentDetails}>
    <dl className={styles.documentMetadata}>
      <div><dt>Дата</dt><dd>{new Date(doc.occurred_at).toLocaleString()}</dd></div>
      {doc.serial_number && <div><dt>Ремонтируемое изделие</dt><dd>{doc.serial_number}</dd></div>}
      {doc.replacement_serial_number && <div><dt>Выдано взамен</dt><dd>{doc.replacement_serial_number}</dd></div>}
      <div><dt>Источник финансирования</dt><dd>{sources.data?.find((s) => s.id === doc.funding_source_id)?.name ?? '—'}</dd></div>
    </dl>
    <section>
      <h3>Описание</h3>
      <p className={styles.description}>{doc.comment || 'Без комментария'}</p>
    </section>
    <section>
      <h3>Материалы</h3>
      <ul>{(doc.entries ?? doc.material_costs ?? doc.materials ?? []).map((line) => <li key={line.material_id}>
        {line.name ?? catalog.data?.find((m) => m.id === line.material_id)?.name ?? line.material_id}: {line.quantity}
        {line.defective_quantity && `; брак: ${line.defective_quantity}`}
        {line.unit_price && `; цена: ${line.unit_price}`}
      </li>)}</ul>
    </section>
    {doc.operation_snapshots && <section>
      <h3>Операции</h3>
      <ul>{doc.operation_snapshots.map((line, index) => <li key={index}>
        {line.name}: {line.quantity} · ставка {line.rate}
      </li>)}</ul>
    </section>}
    {doc.service_cost && <p>Дополнительные расходы: {doc.service_cost}</p>}
  </div>;
}

export function History({kind, onCopy, copyingDisabled = false}: {
  kind: 'receipt' | 'repair';
  onCopy?: (doc: Document) => void;
  copyingDisabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Document | null>(null);
  const query = useQuery({
    queryKey: ['business-documents', kind, offset],
    queryFn: () => apiRequest<Document[]>(`/business-documents?kind=${kind}&offset=${offset}`),
  });
  return <section className={styles.form} aria-label={kind === 'repair' ? 'История ремонтов' : 'История приходов'}>
    <h2>История {kind === 'repair' ? 'ремонтов' : 'приходов'}</h2>
    {query.isPending && <Loader />}
    {query.isError && <Alert theme="danger" message={getErrorMessage(query.error)} />}
    {query.data?.length === 0 && <p>Записей пока нет.</p>}
    <div className={kind === 'repair' ? styles.historyList : undefined}>
      {query.data?.map((doc) => kind === 'repair' ? (
        <button type="button" key={doc.id} className={styles.historyEntry}
          onClick={() => setSelected(doc)} aria-label={`Открыть ремонт ${doc.serial_number}`}>
          <strong>{doc.serial_number}</strong>
          <time dateTime={doc.occurred_at}>{new Date(doc.occurred_at).toLocaleString()}</time>
          <span className={styles.historyComment}>{doc.comment}</span>
          {doc.replacement_serial_number && <span>Подмена: {doc.replacement_serial_number}</span>}
        </button>
      ) : (
        <details key={doc.id}>
          <summary>{new Date(doc.occurred_at).toLocaleString()} · Приход · {doc.comment}</summary>
          <DocumentDetails document={doc} />
        </details>
      ))}
    </div>
    <div className={styles.row}>
      <Button disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - 100))}>Назад</Button>
      <Button disabled={(query.data?.length ?? 0) < 100 || query.isFetching} onClick={() => setOffset(offset + 100)}>Далее</Button>
    </div>
    <Dialog open={selected !== null} onClose={() => setSelected(null)} maxWidth="m" contentOverflow="auto">
      <Dialog.Header caption={`Ремонт ${selected?.serial_number ?? ''}`} />
      <Dialog.Body>{selected && <DocumentDetails document={selected} />}</Dialog.Body>
      <Dialog.Footer>
        <div className={styles.row}>
          {onCopy && <Button view="action" disabled={copyingDisabled} onClick={() => {
            if (selected) {onCopy(selected); setSelected(null);}
          }}>Создать похожий ремонт</Button>}
          <Button onClick={() => setSelected(null)}>Закрыть</Button>
        </div>
      </Dialog.Footer>
    </Dialog>
  </section>;
}

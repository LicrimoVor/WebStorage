import { Alert, Button, Dialog } from "@gravity-ui/uikit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FinanceEntry } from "@/entities/Finance";
import { FundingSelect, useFundingSources } from "@/entities/Funding";
import { FundingSplit } from "@/entities/Funding/FundingSplit";
import { useFundingSplit } from "@/entities/Funding/split";
import { apiRequest, getErrorMessage } from "@/shared/api";
import { TextInput, TextArea } from "@/shared/ui/FormControls";
import { formatDateTime, formatMoney, normalizeDecimal } from "@/shared/lib";
import styles from "./FinancePage.module.scss";

interface Details {
  entry: FinanceEntry;
  revision: number;
  history: Array<{
    id: string;
    before: FinanceEntry;
    after: FinanceEntry;
    reason: string;
    created_by: string;
    created_at: string;
  }>;
}

export function FinanceEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["finance", "edit", id],
    queryFn: () => apiRequest<Details>(`/finance/entries/${id}`),
  });
  return (
    <Dialog open onClose={onClose} size="l">
      <Dialog.Header caption="Финансовая операция" />
      <Dialog.Body>
        {query.isPending && <p>Загрузка…</p>}
        {query.isError && (
          <Alert theme="danger" message={getErrorMessage(query.error)} />
        )}
        {query.data && (
          <EditorForm
            key={`${id}-${query.data.revision}`}
            data={query.data}
            onClose={onClose}
          />
        )}
      </Dialog.Body>
    </Dialog>
  );
}

function EditorForm({ data, onClose }: { data: Details; onClose: () => void }) {
  const entry = data.entry;
  const [amount, setAmount] = useState(entry.amount);
  const [comment, setComment] = useState(entry.comment ?? "");
  const [source, setSource] = useState(entry.funding_source_id ?? "");
  const [date, setDate] = useState(() => {
    const d = new Date(entry.occurred_at);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const split = useFundingSplit(
    amount,
    source,
    (entry.funding_allocations ?? []).filter(
      (p) => p.funding_source_id !== entry.funding_source_id,
    ),
  );
  const sources = useFundingSources();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/finance/entries/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: normalizeDecimal(amount),
          comment,
          occurred_at: new Date(date).toISOString(),
          funding_source_id: source,
          funding_allocations: [],
          ...split.payload,
          revision: data.revision,
        }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
  const funding = (e: FinanceEntry) =>
    e.funding_allocations?.length
      ? e.funding_allocations
          .map(
            (p) =>
              `${sources.data?.find((s) => s.id === p.funding_source_id)?.name ?? p.funding_source_id}: ${formatMoney(p.amount)}`,
          )
          .join("; ")
      : (sources.data?.find((s) => s.id === e.funding_source_id)?.name ??
        "Не указан");
  return (
    <div className={styles.form}>
      <p>
        {entry.category} · {entry.description}. Автор:{" "}
        {entry.created_by || "unknow"}.
      </p>
      <TextInput
        label="Сумма, ₽"
        value={amount}
        onUpdate={setAmount}
        controlProps={{ inputMode: "decimal" }}
      />
      <label className={styles.nativeField}>
        Дата операции
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <FundingSelect value={source} onChange={setSource} />
      <FundingSplit primary={source} split={split} />
      <TextArea label="Комментарий" value={comment} onUpdate={setComment} />
      {entry.source_type === "labour" && (
        <p>
          При изменении суммы распределение этой выплаты по работам будет
          пересчитано, начиная с самых ранних неоплаченных работ.
        </p>
      )}
      {mutation.isError && (
        <Alert theme="danger" message={getErrorMessage(mutation.error)} />
      )}
      <div className={styles.headerActions}>
        <Button
          view="action"
          loading={mutation.isPending}
          disabled={
            !split.valid ||
            !source ||
            !date ||
            !/^\d+(?:[.,]\d{1,2})?$/.test(amount) ||
            Number(normalizeDecimal(amount)) <= 0
          }
          onClick={() => mutation.mutate()}
        >
          Сохранить
        </Button>
        <Button disabled={mutation.isPending} onClick={onClose}>
          Закрыть
        </Button>
      </div>
      <h3>История изменений</h3>
      {!data.history.length && <p>Операция ещё не изменялась.</p>}
      {[...data.history].reverse().map((h) => (
        <section className={styles.historyEntry} key={h.id}>
          <p>
            <strong>
              {formatDateTime(h.created_at)} · {h.created_by}
            </strong>
            <br />
            {h.reason}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Поле</th>
                  <th>До</th>
                  <th>После</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Сумма",
                    formatMoney(h.before.amount),
                    formatMoney(h.after.amount),
                  ],
                  [
                    "Дата",
                    formatDateTime(h.before.occurred_at),
                    formatDateTime(h.after.occurred_at),
                  ],
                  ["Финансирование", funding(h.before), funding(h.after)],
                  [
                    "Комментарий",
                    h.before.comment ?? "—",
                    h.after.comment ?? "—",
                  ],
                ]
                  .filter(([, before, after]) => before !== after)
                  .map(([label, before, after]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>{before}</td>
                      <td>{after}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

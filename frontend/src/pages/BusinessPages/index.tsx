import { AppearanceSettings } from "./AppearanceSettings";
import { FundingSplit } from "@/entities/Funding/FundingSplit";
import { useFundingSplit } from "@/entities/Funding/split";
import { ManageFundingSources } from "@/entities/Funding/ManageFundingSources";
import { Select, TextInput, TextArea } from "@/shared/ui/FormControls";
import { useAuthSessionQuery } from "@/entities/Auth";
import { isAdmin, canAccess } from "@/shared/lib/access";
import { isDecimal } from "@/shared/lib";
import { useProductionPlansQuery } from "@/entities/ProductionPlan";
import { PlanRelease } from "./PlanRelease";
import { Alert, Button, Icon } from "@gravity-ui/uikit";
import { ClockArrowRotateLeft, Persons } from "@gravity-ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FundingSelect } from "@/entities/Funding";
import {
  useStockRevisionRowsQuery,
  type StockRevisionRow,
} from "@/entities/StockRevision";
import { useInventoryGroupsQuery } from "@/entities/InventoryGroup";
import { useProductOptionsQuery } from "@/entities/ManufacturedItem";
import { ProduceManufacturedItemButton } from "@/features/ProduceManufacturedItem";
import { apiRequest, getErrorMessage } from "@/shared/api";
import styles from "./BusinessPages.module.scss";
import {
  History,
  type Document,
  type Line,
  type OperationLine,
} from "./History";

const now = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const decimal = (value: string) => value.replace(",", ".");
const isMoney = (value: string) => /^\d+(?:[.,]\d{1,2})?$/.test(value.trim());
interface Unit {
  issued_for_repair_id: string | null;
  id: string;
  serial_number: string;
  product_id: string;
  photo: string | null;
  sale_id: string | null;
  created_at: string;
}

export function SettingsPage() {
  const session = useAuthSessionQuery();
  const admin = Boolean(session.data && isAdmin(session.data));
  return (
    <main className={styles.page}>
      <h1>Настройки</h1>
      {session.data && (
        <AppearanceSettings
          key={session.data.username}
          username={session.data.username}
        />
      )}
      {session.data && canAccess(session.data, "finance") && (
        <ManageFundingSources />
      )}
      {admin && (
        <div className={styles.row}>
          <Button
            component={Link}
            to="/settings/users"
            view="outlined"
            size="l"
          >
            <Icon data={Persons} size={20} />
            Пользователи
          </Button>
          <Button
            component={Link}
            to="/settings/audit"
            view="outlined"
            size="l"
          >
            <Icon data={ClockArrowRotateLeft} size={20} />
            Журнал событий
          </Button>
        </div>
      )}
    </main>
  );
}

export function ReceiptPage() {
  const rows = useStockRevisionRowsQuery({ type: "material" });
  const groups = useInventoryGroupsQuery();
  const [values, setValues] = useState<Record<string, { quantity: string }>>(
    {},
  );
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(now);
  const fundingSplit = useFundingSplit(amount, source);
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/warehouse/receipts", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({
          funding_source_id: source,
          ...fundingSplit.payload,
          comment,
          total_amount: decimal(amount.trim()),
          occurred_at: new Date(date).toISOString(),
          entries: Object.entries(values)
            .filter(([, v]) => Number(decimal(v.quantity.trim())) > 0)
            .map(([id, v]) => ({
              material_id: id,
              quantity: decimal(v.quantity.trim()),
            })),
        }),
      }),
    onSuccess: async () => {
      setValues({});
      setAmount("");
      fundingSplit.reset();
      setComment("");
      key.current = crypto.randomUUID();
      await client.invalidateQueries();
    },
  });
  const invalidLine = Object.values(values).some((v) => {
    const quantity = v.quantity.trim() || "0";
    return !isDecimal(quantity) || Number(decimal(quantity)) < 0;
  });
  const sections = new Map<string, StockRevisionRow[]>();
  for (const row of rows.data ?? []) {
    const group = groups.data?.find((g) => g.id === row.groups?.[0]?.id);
    const parent = groups.data?.find((g) => g.id === group?.parent_id);
    const title = parent
      ? `${parent.name} / ${group?.name}`
      : (group?.name ?? "Без группы");
    sections.set(title, [...(sections.get(title) ?? []), row]);
  }
  return (
    <main className={styles.page}>
      <h1>Приход материалов</h1>
      <section className={styles.form}>
        <FundingSelect value={source} onChange={setSource} />
        <FundingSplit split={fundingSplit} primary={source} />
        <TextInput
          label="Сумма за приход, ₽"
          value={amount}
          onUpdate={setAmount}
          controlProps={{
            inputMode: "decimal",
            "aria-label": "Сумма за приход",
          }}
          placeholder="0,00"
        />
        <label>
          Дата{" "}
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <TextInput label="Комментарий" value={comment} onUpdate={setComment} />
        {rows.isError && (
          <Alert theme="danger" message={getErrorMessage(rows.error)} />
        )}
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Материал</th>
                <th data-numeric>Остаток</th>
                <th data-numeric>Приход</th>
              </tr>
            </thead>
            <tbody>
              {[...sections]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([title, materials]) => (
                  <Fragment key={title}>
                    <tr className={styles.group}>
                      <td colSpan={3}>{title.split(" / ")[0]}</td>
                    </tr>
                    {title.includes(" / ") && (
                      <tr className={styles.group}>
                        <td colSpan={3} style={{ paddingLeft: 30 }}>
                          {title.split(" / ")[1]}
                        </td>
                      </tr>
                    )}
                    {materials.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td data-numeric>
                          {row.current_quantity} {row.unit}
                        </td>
                        {(["quantity"] as const).map((field) => (
                          <td data-numeric key={field}>
                            <TextInput
                              value={values[row.id]?.[field] ?? ""}
                              controlProps={{
                                "aria-label": `${field === "quantity" ? "Приход" : "Брак"}: ${row.name}`,
                                inputMode: "decimal",
                              }}
                              onUpdate={(value) =>
                                setValues((current) => ({
                                  ...current,
                                  [row.id]: {
                                    ...(current[row.id] ?? { quantity: "" }),
                                    [field]: value,
                                  },
                                }))
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
        {invalidLine && (
          <Alert
            theme="warning"
            message="Количество должно быть неотрицательным числом с точностью до 6 знаков."
          />
        )}
        {amount && !isMoney(amount) && (
          <Alert
            theme="warning"
            message="Укажите сумму от нуля с точностью до копеек."
          />
        )}
        <Button
          view="action"
          loading={mutation.isPending}
          disabled={
            !fundingSplit.valid ||
            invalidLine ||
            !isMoney(amount) ||
            !source ||
            !date ||
            !Object.values(values).some((v) => Number(decimal(v.quantity)) > 0)
          }
          onClick={() => mutation.mutate()}
        >
          Провести приход
        </Button>
        {mutation.isError && (
          <Alert theme="danger" message={getErrorMessage(mutation.error)} />
        )}
        {mutation.isSuccess && (
          <Alert theme="success" message="Приход сохранён" />
        )}
      </section>
      <History kind="receipt" />
    </main>
  );
}

export function RepairsPage() {
  const materials = useStockRevisionRowsQuery({ type: "material" });
  const operations = useQuery({
    queryKey: ["repair-operations"],
    queryFn: async () => {
      const all: { id: string; name: string }[] = [];
      for (let page = 1; ; page++) {
        const result = await apiRequest<{
          items: { id: string; name: string }[];
          pages: number;
        }>(`/operations?page_size=100&page=${page}`);
        all.push(...result.items);
        if (page >= result.pages) return all;
      }
    },
  });
  const [source, setSource] = useState("");
  const [date, setDate] = useState(now);
  const [serial, setSerial] = useState("");
  const [replacement, setReplacement] = useState("");
  const [comment, setComment] = useState("");
  const [cost, setCost] = useState("0");
  const fundingSplit = useFundingSplit(cost, source);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([
    { material_id: "", quantity: "1" },
  ]);
  const [works, setWorks] = useState<OperationLine[]>([
    { operation_id: "", quantity: "1" },
  ]);
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/repairs", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({
          funding_source_id: source,
          ...fundingSplit.payload,
          occurred_at: new Date(date).toISOString(),
          serial_number: serial,
          replacement_serial_number: replacement.trim() || null,
          comment,
          service_cost: decimal(cost),
          copied_from_id: copiedFrom,
          materials: lines.map((line) => ({
            ...line,
            quantity: decimal(line.quantity),
          })),
          operations: works.map((line) => ({
            ...line,
            quantity: decimal(line.quantity),
          })),
        }),
      }),
    onSuccess: async () => {
      key.current = crypto.randomUUID();
      setSerial("");
      setReplacement("");
      setComment("");
      setCopiedFrom(null);
      fundingSplit.reset();
      await client.invalidateQueries();
    },
  });
  const copy = (doc: Document) => {
    setSource(doc.funding_source_id);
    fundingSplit.setParts(
      (doc.funding_allocations ?? []).filter(
        (part) => part.funding_source_id !== doc.funding_source_id,
      ),
    );
    setDate(now());
    setSerial("");
    setReplacement("");
    setComment(doc.comment);
    setCost(doc.service_cost ?? "0");
    setLines(doc.materials ?? []);
    setWorks(doc.operations ?? []);
    setCopiedFrom(doc.id);
    key.current = crypto.randomUUID();
    mutation.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <main className={styles.page}>
      <h1>Ремонт</h1>
      <div className={styles.repairLayout}>
        <section className={styles.form}>
          {copiedFrom && (
            <Alert
              theme="info"
              message="Скопирован предыдущий ремонт. Укажите номер изделия и дополните описание."
            />
          )}
          <div className={styles.row}>
            <TextInput
              label="Номер ремонтируемого изделия"
              value={serial}
              onUpdate={setSerial}
            />
            <TextInput
              label="Выдано взамен (необязательно)"
              value={replacement}
              onUpdate={setReplacement}
            />
          </div>
          <label>
            Дата{" "}
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Описание ремонта
            <TextArea
              placeholder="Причина обращения, выполненные работы и дополнения"
              value={comment}
              onUpdate={setComment}
              controlProps={{ "aria-label": "Описание ремонта" }}
            />
          </label>
          <FundingSelect value={source} onChange={setSource} />
          <FundingSplit split={fundingSplit} primary={source} />
          <h2>Потраченные материалы</h2>
          {lines.map((line, index) => (
            <div className={styles.row} key={index}>
              <Select
                width="max"
                filterable
                placeholder="Материал"
                value={line.material_id ? [line.material_id] : []}
                options={(materials.data ?? []).map((m) => ({
                  value: m.id,
                  content: `${m.name} (${m.unit})`,
                }))}
                onUpdate={(ids) =>
                  setLines(
                    lines.map((l, i) =>
                      i === index ? { ...l, material_id: ids[0] ?? "" } : l,
                    ),
                  )
                }
              />
              <TextInput
                label="Количество"
                value={line.quantity}
                onUpdate={(quantity) =>
                  setLines(
                    lines.map((l, i) => (i === index ? { ...l, quantity } : l)),
                  )
                }
              />
              <Button
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                Удалить
              </Button>
            </div>
          ))}
          <Button
            onClick={() =>
              setLines([...lines, { material_id: "", quantity: "1" }])
            }
          >
            Добавить материал
          </Button>
          <h2>Выполненные операции</h2>
          {works.map((line, index) => (
            <div className={styles.row} key={index}>
              <Select
                width="max"
                filterable
                placeholder="Операция"
                value={line.operation_id ? [line.operation_id] : []}
                options={(operations.data ?? []).map((op) => ({
                  value: op.id,
                  content: op.name,
                }))}
                onUpdate={(ids) =>
                  setWorks(
                    works.map((l, i) =>
                      i === index ? { ...l, operation_id: ids[0] ?? "" } : l,
                    ),
                  )
                }
              />
              <TextInput
                label="Количество"
                value={line.quantity}
                onUpdate={(quantity) =>
                  setWorks(
                    works.map((l, i) => (i === index ? { ...l, quantity } : l)),
                  )
                }
              />
              <Button
                disabled={works.length === 1}
                onClick={() => setWorks(works.filter((_, i) => i !== index))}
              >
                Удалить
              </Button>
            </div>
          ))}
          <Button
            onClick={() =>
              setWorks([...works, { operation_id: "", quantity: "1" }])
            }
          >
            Добавить операцию
          </Button>
          <TextInput
            label="Дополнительные расходы на ремонт"
            value={cost}
            onUpdate={setCost}
          />
          <p>
            Материалы учитываются в закупках; здесь укажите дополнительные
            оплаченные услуги ремонта.
          </p>
          <Button
            view="action"
            loading={mutation.isPending}
            disabled={
              !fundingSplit.valid ||
              !source ||
              !serial.trim() ||
              !comment.trim() ||
              !date ||
              lines.some((l) => !l.material_id) ||
              works.some((l) => !l.operation_id)
            }
            onClick={() => mutation.mutate()}
          >
            Сохранить ремонт
          </Button>
          {mutation.isError && (
            <Alert theme="danger" message={getErrorMessage(mutation.error)} />
          )}
          {mutation.isSuccess && (
            <Alert
              theme="success"
              message="Ремонт сохранён, материалы списаны"
            />
          )}
        </section>
        <aside className={styles.repairHistory}>
          <History
            kind="repair"
            onCopy={copy}
            copyingDisabled={mutation.isPending}
          />
        </aside>
      </div>
    </main>
  );
}

export function ProductionPage() {
  const plans = useProductionPlansQuery({
    status: "active",
    page: 1,
    page_size: 100,
  });
  const products = useProductOptionsQuery();
  const [offset, setOffset] = useState(0);
  const units = useQuery({
    queryKey: ["product-units", offset],
    queryFn: () => apiRequest<Unit[]>(`/product-units?offset=${offset}`),
  });
  return (
    <main className={styles.page}>
      <h1>Выпуск продукции</h1>
      <p>
        Зафиксируйте изготовление: материалы спишутся, а готовые изделия с
        уникальными номерами поступят на склад. Доход от покупателя учитывается
        отдельно в продажах.
      </p>
      <section className={styles.form}>
        <h2>По активным планам</h2>
        {plans.data?.items.map((plan) => (
          <div className={styles.row} key={plan.id}>
            <strong>{plan.product_name}</strong>
            <span>Осталось: {plan.remaining_quantity}</span>
            <PlanRelease plan={plan} />
          </div>
        ))}
        {plans.isError && (
          <Alert theme="danger" message={getErrorMessage(plans.error)} />
        )}
      </section>
      <section className={styles.form}>
        <h2>Выпуск без плана</h2>
        {products.data?.map((item) => (
          <div className={styles.row} key={item.id}>
            <strong>{item.name}</strong>
            <ProduceManufacturedItemButton
              itemId={item.id}
              itemName={item.name}
              serialized
              label="Выпустить"
            />
          </div>
        ))}
        {products.isError && (
          <Alert theme="danger" message={getErrorMessage(products.error)} />
        )}
      </section>
      <section className={styles.form}>
        <h2>Выпущенные изделия</h2>
        {units.isError && (
          <Alert theme="danger" message={getErrorMessage(units.error)} />
        )}
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Продукт</th>
                <th>Дата</th>
                <th>Фото</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {units.data?.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.serial_number || "Без номера"}</td>
                  <td>
                    {products.data?.find((p) => p.id === unit.product_id)?.name}
                  </td>
                  <td>{new Date(unit.created_at).toLocaleString()}</td>
                  <td>
                    {unit.photo && (
                      <a href={unit.photo} target="_blank" rel="noreferrer">
                        Фото
                      </a>
                    )}
                  </td>
                  <td>
                    {unit.issued_for_repair_id
                      ? "Выдано по ремонту"
                      : unit.sale_id
                        ? "Продано"
                        : "На складе"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.row}>
          <Button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 100))}
          >
            Назад
          </Button>
          <Button
            disabled={(units.data?.length ?? 0) < 100}
            onClick={() => setOffset(offset + 100)}
          >
            Далее
          </Button>
        </div>
      </section>
    </main>
  );
}

import {Alert, Dialog} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {ApiError, apiRequest, getErrorMessage} from '@/shared/api';
import {JsonImportButton, JsonImportDialog} from '@/shared/ui/JsonImportDialog';
import styles from './ImportCatalogButton.module.scss';

type Kind = 'warehouse' | 'operations';
const examples = {
  warehouse: {
    version: 1,
    materials: [{name: 'Лист алюминиевый', unit: 'шт', initial_quantity: '10', price: '1500.00', group: ['Металлы', 'Листы']}],
    products: [{name: 'Корпус К-1', unit: 'шт'}],
    semi_finished: [{name: 'Заготовка К-1', unit: 'шт', product: 'Корпус К-1', initial_quantity: '2', group: ['Заготовки', 'Корпуса']}],
  },
  operations: {version: 1, operations: [{name: 'Сборка корпуса', group: 'Сборочные', time_norm: '20', price_per_operation: '350.00'}]},
};

function ImportForm({kind, onClose, onSuccess}: {kind: Kind; onClose: () => void; onSuccess: (count: number) => void}) {
  const client = useQueryClient();
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{payload: unknown; groups: string[][]}>();
  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiRequest<{created: number}>(`/${kind}/import`, {method: 'POST', body: JSON.stringify(payload)}),
    onSuccess: async (result) => { await client.invalidateQueries(); onSuccess(result.created); },
    onError: () => setConfirmation(undefined),
  });
  const preview = useMutation({
    mutationFn: (payload: unknown) => apiRequest<{new_groups: string[][]}>(`/${kind}/import/preview`, {method: 'POST', body: JSON.stringify(payload)}),
    onSuccess: (result, payload) => {
      if (result.new_groups.length) setConfirmation({payload, groups: result.new_groups});
      else mutation.mutate(payload);
    },
  });
  const busy = mutation.isPending || preview.isPending;
  const requestError = preview.error ?? mutation.error;
  const submit = () => {
    setError(''); mutation.reset(); preview.reset();
    if (new Blob([source]).size > 1024 * 1024) { setError('Размер JSON не должен превышать 1 МБ.'); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(source.replace(/^\uFEFF/, '')); }
    catch { setError('Некорректный JSON. Проверьте двойные кавычки, запятые и скобки.'); return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { setError('В корне JSON должен быть объект с полем version: 1.'); return; }
    preview.mutate(parsed);
  };
  if (confirmation) return <Dialog open size="m" onClose={() => { if (!busy) setConfirmation(undefined); }}>
    <Dialog.Header caption="Создать новые группы / подгруппы?" />
    <Dialog.Body><div className={styles.body}>
      <p>В JSON указаны отсутствующие группы. После подтверждения они будут созданы вместе с импортируемыми записями.</p>
      <ul>{confirmation.groups.map((path) => <li key={JSON.stringify(path)} style={{marginBlock: 8, overflowWrap: 'anywhere'}}>
        {path.length === 2 ? 'Подгруппа: ' : 'Группа: '}{path.join(' → ')}
      </li>)}</ul>
      <p>При отмене ничего не создаётся, введённый JSON сохраняется в форме.</p>
    </div></Dialog.Body>
    <Dialog.Footer textButtonCancel="Вернуться к JSON" textButtonApply="Создать и импортировать"
      onClickButtonCancel={() => { if (!busy) setConfirmation(undefined); }}
      onClickButtonApply={() => mutation.mutate(confirmation.payload)}
      propsButtonApply={{loading: busy, disabled: busy}} propsButtonCancel={{disabled: busy}} />
  </Dialog>;
  const example = JSON.stringify(examples[kind], null, 2);
  const prompt = `Преобразуй исходные данные в JSON ${kind === 'warehouse' ? 'каталога склада' : 'каталога операций'} WebStorage. Верни только JSON без Markdown по примеру:
${example}
version — строго 1. Неизвестные поля запрещены. До 500 записей и 1 МБ. Создаются только новые записи.
${kind === 'warehouse'
    ? 'У материалов, продуктов и полуфабрикатов обязательны name (до 200 символов) и unit (до 32). initial_quantity — неотрицательный начальный остаток, до 6 знаков после точки. У материала price — необязательная неотрицательная цена, до 2 знаков после точки. group у материалов и полуфабрикатов — массив из названия группы и необязательной подгруппы. У полуфабриката product — название активного продукта или продукта из массива products этого JSON. Не оформляй закупку или выпуск.'
    : 'У операции обязательно name (до 200 символов). group — название корневой группы или массив [группа, подгруппа]. time_norm — положительная норма времени в минутах, до 6 знаков после точки. price_per_operation — неотрицательная ставка в рублях, до 2 знаков после точки. Неизвестные значения пропусти или укажи null.'}
Названия и единицы не могут быть пустыми. Числа передавай строками с точкой. Не придумывай количества, цены и нормы. Новые группы будут показаны пользователю перед созданием.`;
  return <JsonImportDialog open title={kind === 'warehouse' ? 'Импорт склада из JSON' : 'Импорт операций из JSON'}
    source={source} onUpdate={(value) => {setSource(value); setError(''); mutation.reset(); preview.reset();}}
    onClose={onClose} onSubmit={submit} busy={busy} example={example} prompt={prompt}
    description={<p>Загрузите файл или вставьте JSON. Создаются только новые записи, существующие не изменяются. При любой ошибке ничего не сохраняется. Не более 500 записей и 1 МБ за один импорт.</p>}
    formatDescription={<>
        <p><code>version</code> — обязательно число <code>1</code>. Неизвестные поля запрещены. Названия сравниваются без учёта регистра, включая архивные записи.</p>
        {kind === 'warehouse' ? <>
          <p>Название материала уникально внутри его группы или подгруппы, включая архив. В разных группах одинаковые названия разрешены. Для материалов без группы название уникально внутри раздела «Без группы». Названия продуктов и полуфабрикатов остаются уникальными на всём складе.</p>
          <p><code>materials</code>, <code>products</code>, <code>semi_finished</code> — массивы материалов, продуктов и полуфабрикатов. Ненужные массивы можно пропустить. Хотя бы один должен содержать записи.</p>
          <p>У каждой записи обязательны <code>name</code> (название, до 200 символов) и <code>unit</code> (единица измерения, до 32). Необязательное <code>initial_quantity</code> — начальный остаток ≥ 0, по умолчанию 0, до 6 знаков после точки.</p>
          <p>У материала: <code>price</code> — цена ≥ 0, до 2 знаков после точки, без цены — пропустить или null. У материалов и полуфабрикатов <code>group</code> — путь из одного или двух названий: ["Группа", "Подгруппа"]. Без группы — пропустить или []. Новые группы и подгруппы показываются в отдельном окне и создаются после подтверждения. Подгруппы могут иметь одинаковые названия у разных родителей. Подгруппа определяется полным путём; внутри одной группы повторяющиеся названия запрещены.</p>
          <p>У полуфабриката обязательно <code>product</code> — название активного продукта на складе или из массива products этого файла. Продукты импортируются раньше полуфабрикатов.</p>
          <p>Начальный остаток записывается в историю движений. Импорт не оформляет закупку, оплату или выпуск с серийными номерами. Для них используйте «Приход» и «Выпуск».</p>
        </> : <>
          <p><code>operations</code> — обязательный массив операций. У каждой обязательно <code>name</code> — название до 200 символов.</p>
          <p><code>group</code> — название корневой группы или путь ["Группа", "Подгруппа"], каждое название до 200 символов. Подгруппы могут одинаково называться у разных родителей. Новые группы показываются перед импортом и создаются после подтверждения. Пропустите или укажите null для операции без группы.</p>
          <p><code>time_norm</code> — норма времени в минутах на единицу &gt; 0, до 6 знаков после точки; <code>price_per_operation</code> — ставка в рублях на единицу ≥ 0, до 2 знаков после точки. Оба поля необязательны: пропустите или укажите null, если значение не задано.</p>
        </>}
        <p>Числа можно передавать числом или строкой с точкой, например "12.50". Названия и единицы не могут быть пустыми.</p>
    </>}
    error={<>
      {error && <Alert theme="danger" message={error} />}
      {requestError && <Alert theme="danger" title="Импорт отменён" message={<>
        <p>{requestError instanceof ApiError && requestError.status === 422 ? 'Проверьте поля по описанию формата.' : getErrorMessage(requestError)}</p>
        {requestError instanceof ApiError && requestError.fields?.map((field, index) => <p key={index}><code>{Array.isArray(field.location) ? field.location.filter((part) => part !== 'body').join('.') : ''}</code>: {String(field.message ?? '')}</p>)}
      </>} />}
    </>} />;
}

export function ImportCatalogButton({kind}: {kind: Kind}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number>();
  return <>
    <JsonImportButton onClick={() => { setCount(undefined); setOpen(true); }} />
    {count !== undefined && <span role="status">Импортировано записей: {count}</span>}
    {open && <ImportForm kind={kind} onClose={() => setOpen(false)} onSuccess={(created) => { setCount(created); setOpen(false); }} />}
  </>;
}

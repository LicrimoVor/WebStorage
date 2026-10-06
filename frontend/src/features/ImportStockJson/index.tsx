import {Alert} from '@gravity-ui/uikit';
import {useState} from 'react';
import type {StockRevisionRow} from '@/entities/StockRevision';
import {JsonImportButton, JsonImportDialog} from '@/shared/ui/JsonImportDialog';
import {parseStockImport, type StockImportMode, type StockImportDocument} from './model';

export function ImportStockJson({mode, catalog, disabled, onImport}: {
  mode: StockImportMode; catalog: StockRevisionRow[]; disabled: boolean;
  onImport: (document: StockImportDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const example = mode === 'receipt'
    ? {comment: 'Поставка', total_amount: '1500.00', entries: [{material_id: catalog[0]?.id ?? 'UUID материала', quantity: '12.5'}]}
    : {comment: 'Инвентаризация', entries: [{id: catalog[0]?.id ?? 'UUID позиции', type: catalog[0]?.type ?? 'material', counted_quantity: '12.5'}]};
  const format = JSON.stringify(example, null, 2);
  const prompt = `Преобразуй исходный документ, текст, фото или таблицу в JSON ${mode === 'receipt' ? 'прихода материалов' : 'ревизии склада'} WebStorage.
Верни только JSON без Markdown в формате:
${format}
${mode === 'receipt' ? 'quantity — поступившее положительное количество. total_amount — общая сумма в рублях (необязательно).' : 'counted_quantity — фактический остаток (не изменение), допускается 0. type: material, semi_finished или product.'}
Количество — десятичная строка с точкой, до 14 цифр до точки и 6 знаков после точки. Сумма — десятичная строка с точкой, до 18 цифр до точки и 2 знаков после точки. Не придумывай позиции или количества. Используй только идентификаторы и типы из каталога ниже. Каждую позицию включай один раз. Если название неоднозначно или позиции нет в каталоге, попроси уточнение. Не включай отсутствующие в исходных данных позиции. comment — необязательный комментарий.
Каталог:
${JSON.stringify(catalog.map((row) => ({id: row.id, type: row.type, name: row.name, unit: row.unit, groups: row.groups?.map((group) => group.name)})), null, 2)}`;
  const submit = () => {
    try {const document = parseStockImport(source, mode, catalog); onImport(document); setOpen(false); setSource(''); setError('');}
    catch (failure) {setError(failure instanceof Error ? failure.message : 'Не удалось прочитать JSON');}
  };
  return <>
    <JsonImportButton disabled={disabled} onClick={() => {setError(''); setOpen(true);}} />
    <JsonImportDialog open={open} onClose={() => setOpen(false)}
      title={mode === 'receipt' ? 'Импорт прихода из JSON' : 'Импорт ревизии из JSON'}
      source={source} onUpdate={(value) => {setSource(value); setError('');}}
      onSubmit={submit} example={format} prompt={prompt} disabled={disabled} maxBytes={5 * 1024 * 1024}
      description={<p>Загрузите файл или вставьте JSON. Импорт добавляет позиции в форму и обновляет количества совпадающих позиций. Проверьте данные перед проведением.</p>}
      formatDescription={<p>{mode === 'receipt'
        ? 'material_id — идентификатор материала из каталога, quantity — поступившее положительное количество, total_amount — необязательная общая сумма в рублях.'
        : 'id — идентификатор позиции из каталога, type — material, semi_finished или product, counted_quantity — фактический остаток, включая 0.'}
        {' '}Количество задаётся десятичной строкой с точкой, до 6 знаков после точки. До 2000 позиций. comment — необязательный комментарий.</p>}
      inputLabel="JSON складского документа" applyText="Добавить в форму"
      error={error ? <Alert theme="danger" message={error} /> : null} />
  </>;
}

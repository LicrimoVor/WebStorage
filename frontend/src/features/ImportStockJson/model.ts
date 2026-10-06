import type {StockRevisionRow} from '@/entities/StockRevision';
import {isDecimal, normalizeDecimal} from '@/shared/lib';

export type StockImportMode = 'receipt' | 'revision';
export interface StockImportEntry {id: string; type: StockRevisionRow['type']; quantity: string}
export interface StockImportDocument {entries: StockImportEntry[]; comment?: string; total_amount?: string}

function validDecimal(raw: string | number, places: number): boolean {
  if (typeof raw === 'number' && (!Number.isFinite(raw) || Math.abs(raw) > Number.MAX_SAFE_INTEGER)) return false;
  const value = normalizeDecimal(String(raw).trim());
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value)) return false;
  const integer = value.split('.')[0]?.replace(/^0+/, '') ?? '';
  return integer.length <= 20 - places;
}

export function parseStockImport(source: string, mode: StockImportMode, catalog: StockRevisionRow[]): StockImportDocument {
  let document: unknown;
  try {document = JSON.parse(source.replace(/^\uFEFF/, ''));}
  catch {throw new Error('JSON содержит синтаксическую ошибку');}
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Ожидается объект JSON с массивом entries');
  const data = document as Record<string, unknown>;
  if (!Array.isArray(data.entries) || !data.entries.length || data.entries.length > 2000) throw new Error('entries должен содержать от 1 до 2000 позиций');
  const keys = new Set<string>();
  const entries = data.entries.map((value: unknown, index: number): StockImportEntry => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Позиция ${index + 1}: ожидается объект`);
    const entry = value as Record<string, unknown>;
    const type = mode === 'receipt' ? 'material' : entry.type;
    if (mode === 'receipt' && entry.type !== undefined && entry.type !== 'material') throw new Error(`Позиция ${index + 1}: в приходе поддерживаются материалы`);
    const id = mode === 'receipt' ? entry.material_id : entry.id;
    const row = catalog.find((item) => item.id === id && item.type === type);
    if (!row) throw new Error(`Позиция ${index + 1}: идентификатор или тип отсутствует в каталоге`);
    const key = `${row.type}:${row.id}`;
    if (keys.has(key)) throw new Error(`Позиция ${index + 1}: повторная позиция ${row.name}`);
    keys.add(key);
    const raw = mode === 'receipt' ? entry.quantity : entry.counted_quantity;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`Позиция ${index + 1}: укажите количество`);
    const quantity = normalizeDecimal(String(raw).trim());
    if (!isDecimal(quantity) || !validDecimal(raw, 6) || (mode === 'receipt' && Number(quantity) === 0)) throw new Error(`Позиция ${index + 1}: некорректное количество`);
    return {id: row.id, type: row.type, quantity};
  });
  const result: StockImportDocument = {entries};
  if (data.comment !== undefined) {
    if (typeof data.comment !== 'string' || data.comment.length > 2000) throw new Error('Комментарий должен быть строкой до 2000 символов');
    result.comment = data.comment;
  }
  if (mode === 'receipt' && data.total_amount !== undefined) {
    if ((typeof data.total_amount !== 'string' && typeof data.total_amount !== 'number') || !validDecimal(data.total_amount, 2)) throw new Error('Сумма прихода должна быть неотрицательным числом с точностью до копеек');
    result.total_amount = normalizeDecimal(String(data.total_amount).trim());
  }
  return result;
}

import {describe, expect, it} from 'vitest';
import type {StockRevisionRow} from '@/entities/StockRevision';
import {parseStockImport} from './model';

const catalog = [
  {id: 'steel', type: 'material', name: 'Сталь'},
  {id: 'housing', type: 'semi_finished', name: 'Корпус'},
] as StockRevisionRow[];

describe('stock JSON import', () => {
  it('imports actual zero stock and decimal semi finished stock without adding other rows', () => {
    expect(parseStockImport(JSON.stringify({entries: [
      {id: 'steel', type: 'material', counted_quantity: '0'},
      {id: 'housing', type: 'semi_finished', counted_quantity: '2,5'},
    ]}), 'revision', catalog).entries).toEqual([
      {id: 'steel', type: 'material', quantity: '0'},
      {id: 'housing', type: 'semi_finished', quantity: '2.5'},
    ]);
  });
  it('imports receipt quantity, comment and amount', () => {
    expect(parseStockImport(JSON.stringify({comment: 'Поставка', total_amount: '10,50',
      entries: [{material_id: 'steel', quantity: '2'}]}), 'receipt', catalog)).toEqual({
        entries: [{id: 'steel', type: 'material', quantity: '2'}], comment: 'Поставка', total_amount: '10.50',
      });
  });
  it.each([
    {id: 'missing', type: 'material', counted_quantity: '1'},
    {id: 'steel', type: 'semi_finished', counted_quantity: '1'},
    {id: 'steel', type: 'material', counted_quantity: '-1'},
    {id: 'steel', type: 'material', counted_quantity: '0.0000001'},
    {id: 'steel', type: 'material', counted_quantity: '100000000000000'},
  ])('rejects invalid or unknown revision entries atomically', (entry) => {
    expect(() => parseStockImport(JSON.stringify({entries: [entry]}), 'revision', catalog)).toThrow();
  });
  it('accepts server decimal boundaries as strings and rejects overflowing money', () => {
    const entries = [{material_id: 'steel', quantity: '99999999999999.999999'}];
    expect(parseStockImport(JSON.stringify({entries, total_amount: '999999999999999999.99'}), 'receipt', catalog).entries[0]?.quantity).toBe('99999999999999.999999');
    expect(() => parseStockImport(JSON.stringify({entries, total_amount: '1000000000000000000'}), 'receipt', catalog)).toThrow(/Сумма/);
    expect(() => parseStockImport(JSON.stringify({entries, total_amount: 10000000000000000}), 'receipt', catalog)).toThrow(/Сумма/);
  });
  it('rejects duplicates and zero receipt quantities', () => {
    const entry = {material_id: 'steel', quantity: '1'};
    expect(() => parseStockImport(JSON.stringify({entries: [entry, entry]}), 'receipt', catalog)).toThrow(/повторная/);
    expect(() => parseStockImport(JSON.stringify({entries: [{...entry, quantity: '0'}]}), 'receipt', catalog)).toThrow(/количество/);
  });
});

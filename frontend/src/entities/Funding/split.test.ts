import {act, renderHook} from '@testing-library/react';
import {expect, it} from 'vitest';
import {fundingTotal, useFundingSplit} from './split';

it('distributes cents exactly and rejects duplicate or excessive allocations', () => {
  const {result} = renderHook(() => useFundingSplit('100,05', 'main'));
  act(() => result.current.setParts([{funding_source_id: 'other', amount: '40,02'}]));
  expect(result.current.valid).toBe(true);
  expect(result.current.payload.funding_allocations).toEqual([
    {funding_source_id: 'main', amount: '60.03'}, {funding_source_id: 'other', amount: '40.02'},
  ]);
  act(() => result.current.setParts([{funding_source_id: 'main', amount: '40'}]));
  expect(result.current.valid).toBe(false);
  act(() => result.current.setParts([{funding_source_id: 'other', amount: '101'}]));
  expect(result.current.valid).toBe(false);
});

it('rounds quantity times price like the server', () => {
  expect(fundingTotal('0.5', '2.01')).toBe('1.01');
  expect(fundingTotal('3', '0.10')).toBe('0.30');
});

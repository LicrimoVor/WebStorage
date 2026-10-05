import {describe, expect, it} from 'vitest';

import {formatDecimal, formatFixedDecimal} from './format';

describe('formatDecimal', () => {
  it.each([
    ['24.000000', '24'],
    ['24.125000', '24,125'],
    ['0.000001', '0,000001'],
    ['-3.500000', '-3,5'],
    ['1234.000000', '1\u00a0234'],
    ['2,500', '2,5'],
    [24, '24'],
  ])('displays %s without trailing zeros', (source, expected) => {
    expect(formatDecimal(source)).toBe(expected);
  });
});

describe('formatFixedDecimal', () => {
  it.each([
    ['5', '5.00'],
    ['5.1', '5.10'],
    ['5.125', '5.13'],
    ['9.999', '10.00'],
    ['-1.235', '-1.24'],
  ])('formats %s as %s', (source, expected) => {
    expect(formatFixedDecimal(source)).toBe(expected);
  });
});

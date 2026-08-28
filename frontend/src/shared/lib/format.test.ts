import {describe, expect, it} from 'vitest';

import {formatFixedDecimal} from './format';

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

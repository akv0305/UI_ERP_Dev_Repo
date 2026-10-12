import { describe, expect, it } from 'vitest';
import { buildQueryString, firstValue } from './list-params';

describe('buildQueryString', () => {
  it('leaves out empty, undefined, null and "all" values', () => {
    expect(
      buildQueryString({ page: 2, search: '  ', isActive: 'all', x: undefined, y: null, z: 'a b' }),
    ).toBe('page=2&z=a+b');
  });
});

describe('firstValue', () => {
  it('takes the first of repeated parameters', () => {
    expect(firstValue(['a', 'b'])).toBe('a');
    expect(firstValue('a')).toBe('a');
    expect(firstValue(undefined)).toBeUndefined();
  });
});

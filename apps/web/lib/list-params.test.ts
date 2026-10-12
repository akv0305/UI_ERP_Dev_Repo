import { describe, expect, it } from 'vitest';
import { buildQueryString, filterFromContext, firstValue, withSelectedOption } from './list-params';

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

describe('filterFromContext', () => {
  it('defaults to the context value when the URL carries no list parameters', () => {
    expect(filterFromContext({}, 'companyId', 'c-1')).toBe('c-1');
    expect(filterFromContext({}, 'companyId', null)).toBeUndefined();
  });

  it('uses the URL once the user has touched the list, so a cleared filter stays cleared', () => {
    expect(filterFromContext({ page: '1' }, 'companyId', 'c-1')).toBeUndefined();
    expect(filterFromContext({ companyId: 'c-2' }, 'companyId', 'c-1')).toBe('c-2');
  });
});

describe('withSelectedOption', () => {
  const options = [{ value: 'a', label: 'A' }];

  it('adds the selected value with its label when the list lacks it', () => {
    expect(withSelectedOption(options, 'b', 'B')).toEqual([{ value: 'b', label: 'B' }, ...options]);
  });

  it('leaves the list alone when the value is present, unset or has no label', () => {
    expect(withSelectedOption(options, 'a', 'A')).toBe(options);
    expect(withSelectedOption(options, undefined, 'B')).toBe(options);
    expect(withSelectedOption(options, 'b', null)).toBe(options);
  });
});

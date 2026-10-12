import { describe, expect, it } from 'vitest';
import { buildStateOptions } from './state-options';

const states = [
  { id: 'a', gstCode: '25', name: 'Daman and Diu', isActive: false },
  { id: 'b', gstCode: '36', name: 'Telangana', isActive: true },
];

describe('buildStateOptions', () => {
  it('lists only active states by default', () => {
    expect(buildStateOptions(states)).toEqual([{ value: 'b', label: '36 Telangana' }]);
  });

  it('keeps an inactive state that the record already uses', () => {
    expect(buildStateOptions(states, 'a').map((option) => option.value)).toEqual(['a', 'b']);
  });
});

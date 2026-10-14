import { jest } from '@jest/globals';
import { ITEM_CATEGORY_SERIES, ITEM_SERIES, nextCode, type CodeSeriesTx } from './code-series';

function fakeTx(last: number | null) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: jest.fn(async () => {
      calls.push('lock');

      return 0;
    }),
    $queryRaw: jest.fn(async () => {
      calls.push('max');

      return [{ last }];
    }),
  };

  return { tx: tx as unknown as CodeSeriesTx, calls };
}

describe('nextCode', () => {
  it('starts a series at 1', async () => {
    await expect(nextCode(fakeTx(null).tx, ITEM_CATEGORY_SERIES)).resolves.toBe('IG-0001');
    await expect(nextCode(fakeTx(null).tx, ITEM_SERIES)).resolves.toBe('ITM-000001');
  });

  it('continues from the last saved number without gaps', async () => {
    await expect(nextCode(fakeTx(41).tx, ITEM_SERIES)).resolves.toBe('ITM-000042');
  });

  it('takes the lock before reading the last number', async () => {
    const { tx, calls } = fakeTx(3);

    await nextCode(tx, ITEM_CATEGORY_SERIES);

    expect(calls).toEqual(['lock', 'max']);
  });

  it('never truncates when the series outgrows its digits', async () => {
    await expect(nextCode(fakeTx(9999).tx, ITEM_CATEGORY_SERIES)).resolves.toBe('IG-10000');
  });
});

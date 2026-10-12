import { createRequire } from 'node:module';
import { join } from 'node:path';

// Jest runs with the api package as the working directory.
const requireFromApi = createRequire(join(process.cwd(), 'package.json'));
const { STATES } = requireFromApi('./prisma/states-data.cjs') as {
  STATES: { gstCode: string; name: string; isActive: boolean }[];
};

describe('state seed data', () => {
  it('has exactly the 40 specified rows with unique two-character codes', () => {
    expect(STATES).toHaveLength(40);
    expect(new Set(STATES.map((state) => state.gstCode)).size).toBe(40);
    expect(STATES.every((state) => /^\d{2}$/.test(state.gstCode))).toBe(true);
  });

  it('marks only 25 and 28 inactive', () => {
    expect(STATES.filter((state) => !state.isActive).map((state) => state.gstCode)).toEqual([
      '25',
      '28',
    ]);
  });

  it('matches the specified names', () => {
    const byCode = Object.fromEntries(STATES.map((state) => [state.gstCode, state.name]));

    expect(byCode['26']).toBe('Dadra and Nagar Haveli and Daman and Diu');
    expect(byCode['28']).toBe('Andhra Pradesh (Old)');
    expect(byCode['36']).toBe('Telangana');
    expect(byCode['37']).toBe('Andhra Pradesh');
    expect(byCode['97']).toBe('Other Territory');
    expect(byCode['99']).toBe('Centre Jurisdiction');
    expect(STATES.map((state) => state.gstCode).slice(-3)).toEqual(['38', '97', '99']);
  });
});

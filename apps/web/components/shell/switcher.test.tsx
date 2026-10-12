import type { ContextOptionsResponse, SessionContext } from '@uie/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  applyChange,
  changeCompany,
  changeProject,
  companyOptions,
  projectOptionsFor,
} from '@/lib/context';
import { Switcher, isSwitcherDisabled, switcherItems, switcherLabel } from './switcher';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const options: ContextOptionsResponse = {
  companies: [
    { id: ID(1), label: 'UIE — Unique Infra' },
    { id: ID(2), label: 'SPV1 — Metro SPV' },
  ],
  projects: [
    { id: ID(11), label: 'P001 — Metro', companyId: ID(1) },
    { id: ID(12), label: 'P002 — Bridge', companyId: ID(1) },
    { id: ID(21), label: 'P003 — Tunnel', companyId: ID(2) },
  ],
};

const none: SessionContext = {
  companyId: null,
  companyLabel: null,
  projectId: null,
  projectLabel: null,
};

describe('Switcher is controlled', () => {
  const list = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('shows the label of the value it is given, not internal state', () => {
    expect(switcherLabel(list, 'b', 'Pick')).toBe('Beta');
    expect(switcherLabel(list, 'a', 'Pick')).toBe('Alpha');
  });

  it('follows the value when the parent changes it', () => {
    const render = (value: string | null) =>
      renderToStaticMarkup(
        <Switcher options={list} value={value} onChange={() => undefined} placeholder="Pick" />,
      );

    expect(render('a')).toContain('Alpha');
    expect(render('b')).toContain('Beta');
    expect(render('b')).not.toContain('Alpha');
  });

  it('shows the placeholder when nothing is selected and there is no "all" entry', () => {
    expect(switcherLabel(list, null, 'Pick')).toBe('Pick');
    expect(switcherLabel(list, 'unknown', 'Pick')).toBe('Pick');
  });

  it('shows the "all" label while nothing is selected', () => {
    expect(switcherLabel(list, null, 'Pick', 'All projects')).toBe('All projects');
    expect(switcherLabel(list, 'a', 'Pick', 'All projects')).toBe('Alpha');
  });

  it('puts the "all" entry first, with value null', () => {
    expect(switcherItems(list, 'All projects')).toEqual([
      { value: null, label: 'All projects' },
      ...list,
    ]);
    expect(switcherItems(list)).toEqual(list);
  });

  it('is disabled with no options or while a change is being saved', () => {
    expect(isSwitcherDisabled([])).toBe(true);
    expect(isSwitcherDisabled(list)).toBe(false);
    expect(isSwitcherDisabled(list, true)).toBe(true);
  });

  it('renders a disabled button when there are no options', () => {
    const html = renderToStaticMarkup(
      <Switcher options={[]} value={null} onChange={vi.fn()} placeholder="Pick" />,
    );

    expect(html).toContain('disabled');
  });
});

describe('company and project switchers', () => {
  it('the company list is all accessible companies', () => {
    expect(companyOptions(options).map((option) => option.value)).toEqual([ID(1), ID(2)]);
  });

  it('the project list holds only the projects of the selected company', () => {
    expect(projectOptionsFor(options, ID(1)).map((option) => option.value)).toEqual([
      ID(11),
      ID(12),
    ]);
    expect(projectOptionsFor(options, ID(2)).map((option) => option.value)).toEqual([ID(21)]);
  });

  it('with no company selected the project list is empty, so the project switcher is disabled', () => {
    expect(projectOptionsFor(options, null)).toEqual([]);
    expect(isSwitcherDisabled(projectOptionsFor(options, null))).toBe(true);
  });

  it('with no options at all both switchers are disabled', () => {
    const empty: ContextOptionsResponse = { companies: [], projects: [] };

    expect(isSwitcherDisabled(companyOptions(empty))).toBe(true);
    expect(isSwitcherDisabled(projectOptionsFor(empty, null))).toBe(true);
  });

  it('choosing a company asks the API to change the company only (it clears the project)', () => {
    expect(changeCompany(ID(2))).toEqual({ companyId: ID(2) });
    expect('projectId' in changeCompany(ID(2))).toBe(false);
    expect(changeCompany(null)).toEqual({ companyId: null });
  });

  it('choosing a project sends company and project; "All projects" sends a null project', () => {
    expect(changeProject(ID(1), ID(12))).toEqual({ companyId: ID(1), projectId: ID(12) });
    expect(changeProject(ID(1), null)).toEqual({ companyId: ID(1), projectId: null });
  });

  it('applying a company change clears the project and sets both labels', () => {
    const current: SessionContext = {
      companyId: ID(1),
      companyLabel: 'UIE — Unique Infra',
      projectId: ID(11),
      projectLabel: 'P001 — Metro',
    };

    expect(applyChange(current, options, changeCompany(ID(2)))).toEqual({
      companyId: ID(2),
      companyLabel: 'SPV1 — Metro SPV',
      projectId: null,
      projectLabel: null,
    });
  });

  it('applying a project change keeps the company and sets the project', () => {
    const current: SessionContext = {
      companyId: ID(1),
      companyLabel: 'UIE — Unique Infra',
      projectId: null,
      projectLabel: null,
    };

    expect(applyChange(current, options, changeProject(ID(1), ID(12)))).toEqual({
      companyId: ID(1),
      companyLabel: 'UIE — Unique Infra',
      projectId: ID(12),
      projectLabel: 'P002 — Bridge',
    });
  });

  it('"All projects" clears only the project', () => {
    const current: SessionContext = {
      companyId: ID(1),
      companyLabel: 'UIE — Unique Infra',
      projectId: ID(11),
      projectLabel: 'P001 — Metro',
    };

    expect(applyChange(current, options, changeProject(ID(1), null))).toEqual({
      ...current,
      projectId: null,
      projectLabel: null,
    });
  });

  it('clearing the company clears everything', () => {
    const current: SessionContext = {
      companyId: ID(1),
      companyLabel: 'UIE — Unique Infra',
      projectId: ID(11),
      projectLabel: 'P001 — Metro',
    };

    expect(applyChange(current, options, changeCompany(null))).toEqual(none);
  });
});

import { describe, expect, it } from 'vitest';
import {
  areaScore, biggestLiabilities, biggestMovers, defaultQualitativeWorst, drainToBuildRatio,
  entryHealth, intendedVsActual, itemHealth, lifeEquity, makeEntry, neglectedAreas,
  recoveryStrainRatio, weightedAverage,
} from './scoring';
import type { Area, CashFlowEntry, Entry, LineItem, Period } from './types';

const h = (v: number, p: Parameters<typeof itemHealth>[1]) => itemHealth(v, p).value;

describe('itemHealth', () => {
  it('higher: savings toward target', () => {
    const p = { direction: 'higher', target: 10000, worst: 0 } as const;
    expect(h(0, p)).toBe(0);
    expect(h(2500, p)).toBe(25);
    expect(h(10000, p)).toBe(100);
    expect(h(15000, p)).toBe(100); // capped
    expect(h(-500, p)).toBe(0); // floored
  });
  it('lower: debt toward zero', () => {
    const p = { direction: 'lower', target: 0, worst: 20000 } as const;
    expect(h(20000, p)).toBe(0);
    expect(h(5000, p)).toBe(75);
    expect(h(0, p)).toBe(100);
    expect(h(30000, p)).toBe(0);
  });
  it('range: full marks inside tolerance, linear fall-off outside', () => {
    const p = { direction: 'range', target: 170, worst: 220, tolerance: 5 } as const;
    expect(h(168, p)).toBe(100);
    expect(h(175, p)).toBe(100);
    expect(h(220, p)).toBe(0);
    expect(h(197.5, p)).toBe(50); // 22.5 outside tol of 45 span
    expect(h(120, p)).toBe(0);
  });
  it('qualitative rating: higher is better, target 8', () => {
    const p = { direction: 'higher', target: 8, worst: 1 } as const;
    expect(h(1, p)).toBe(0);
    expect(h(5, p)).toBe(57.1);
    expect(h(8, p)).toBe(100);
    expect(h(10, p)).toBe(100);
  });
  it('qualitative rating: lower is better (stress), target 3', () => {
    const p = { direction: 'lower', target: 3, worst: defaultQualitativeWorst('lower') } as const;
    expect(h(10, p)).toBe(0);
    expect(h(3, p)).toBe(100);
    expect(h(6, p)).toBe(57.1);
  });
  it('degenerate target == worst', () => {
    expect(h(5, { direction: 'higher', target: 5, worst: 5 })).toBe(100);
    expect(h(4, { direction: 'higher', target: 5, worst: 5 })).toBe(0);
  });
  it('rejects non-finite values and always explains itself', () => {
    expect(() => itemHealth(NaN, { direction: 'higher', target: 1, worst: 0 })).toThrow();
    expect(itemHealth(5, { direction: 'higher', target: 10, worst: 0 }).formula).toContain('50');
  });
});

describe('weightedAverage', () => {
  it('weights by importance', () => {
    const b = weightedAverage('x', [
      { value: 100, weight: 3, label: 'a' }, { value: 0, weight: 1, label: 'b' },
    ]);
    expect(b.value).toBe(75);
    expect(b.inputs).toHaveLength(2);
  });
  it('empty → null', () => expect(weightedAverage('x', []).value).toBeNull());
});

// ---- fixtures ----
let n = 0;
const item = (o: Partial<LineItem>): LineItem => ({
  id: `i${++n}`, areaId: 'fin', name: 'item', section: 'asset', valueType: 'quantitative',
  direction: 'higher', target: 100, worst: 0, weight: 5, archived: false, ...o,
});
const entry = (it: LineItem, v: number, periodId = 'p1'): Entry => makeEntry(it, periodId, v);

describe('areaScore', () => {
  const savings = item({ name: 'Savings', target: 10000, weight: 5 });
  const debt = item({ name: 'Debt', section: 'liability', direction: 'lower', target: 0, worst: 20000, weight: 5 });

  it('assets and liabilities net out around 50', () => {
    const s = areaScore('fin', [entry(savings, 5000), entry(debt, 10000)]);
    // A=50, liability health=50 → B=50 → (50-50+100)/2 = 50
    expect(s.case).toBe('both');
    expect(s.equity.value).toBe(50);
  });
  it('strong assets, no drain → 100', () => {
    expect(areaScore('fin', [entry(savings, 10000), entry(debt, 0)]).equity.value).toBe(100);
  });
  it('no assets, max drain → 0', () => {
    expect(areaScore('fin', [entry(savings, 0), entry(debt, 20000)]).equity.value).toBe(0);
  });
  it('assets-only and liabilities-only cases', () => {
    expect(areaScore('fin', [entry(savings, 7500)]).case).toBe('assets-only');
    expect(areaScore('fin', [entry(savings, 7500)]).equity.value).toBe(75);
    const lo = areaScore('fin', [entry(debt, 5000)]);
    expect(lo.case).toBe('liabilities-only');
    expect(lo.equity.value).toBe(75);
  });
  it('no data → null; ignores other areas and income-statement items', () => {
    const inflow = item({ section: 'inflow' });
    expect(areaScore('fin', []).equity.value).toBeNull();
    expect(areaScore('fin', [entry(inflow, 100)]).case).toBe('no-data');
    expect(areaScore('health', [entry(savings, 10000)]).case).toBe('no-data');
  });
  it('importance weights shift the result', () => {
    const big = item({ name: 'Big', target: 100, weight: 9 });
    const small = item({ name: 'Small', target: 100, weight: 1 });
    expect(areaScore('fin', [entry(big, 100), entry(small, 0)]).assetStrength.value).toBe(90);
  });
  it('exposes a formula trail', () => {
    const s = areaScore('fin', [entry(savings, 5000), entry(debt, 10000)]);
    expect(s.equity.formula).toContain('break-even');
    expect(s.equity.inputs).toHaveLength(2);
  });
});

describe('lifeEquity', () => {
  const areas: Area[] = [
    { id: 'fin', name: 'Finances', weight: 8, intendedWeeklyHours: 3, order: 0, archived: false },
    { id: 'rec', name: 'Recreation', weight: 2, intendedWeeklyHours: 5, order: 1, archived: false },
    { id: 'lrn', name: 'Learning', weight: 5, intendedWeeklyHours: 4, order: 2, archived: false },
  ];
  it('weights areas and lists those without data', () => {
    const a = item({ areaId: 'fin', target: 100 }); const b = item({ areaId: 'rec', target: 100 });
    const scores = [areaScore('fin', [entry(a, 100)]), areaScore('rec', [entry(b, 0)]), areaScore('lrn', [])];
    const r = lifeEquity(areas, scores);
    expect(r.breakdown.value).toBe(80); // (100*8 + 0*2) / 10
    expect(r.excluded).toEqual(['Learning']);
  });
});

describe('ratios', () => {
  it('drain-to-build uses only hour-denominated items', () => {
    const hrs = (section: LineItem['section'], v: number) =>
      entry(item({ section, unit: 'hours' }), v);
    const r = drainToBuildRatio([
      hrs('outflow', 30), hrs('liability', 10), hrs('inflow', 20), hrs('asset', 20),
      entry(item({ unit: '$' }), 999),
    ]);
    expect(r.value).toBe(1);
  });
  it('drain-to-build null when no build hours', () => {
    expect(drainToBuildRatio([]).value).toBeNull();
  });
  it('recovery vs strain', () => {
    const cf: CashFlowEntry[] = [
      { periodId: 'p', areaId: 'a', actualWeeklyHours: 10, energy: 8 },
      { periodId: 'p', areaId: 'b', actualWeeklyHours: 20, energy: 3 },
      { periodId: 'p', areaId: 'c', actualWeeklyHours: 10, energy: 5 },
    ];
    expect(recoveryStrainRatio(cf).value).toBe(0.3); // 10 / 30
    expect(recoveryStrainRatio([cf[0]!]).value).toBeNull();
  });
  const period: Period = {
    id: 'p', kind: 'month', start: '2026-10-01', end: '2026-10-31', label: 'Oct', status: 'closed',
    intendedHoursByArea: { a: 10, b: 10 },
  };
  it('intended vs actual', () => {
    const cf: CashFlowEntry[] = [
      { periodId: 'p', areaId: 'a', actualWeeklyHours: 5, energy: 6 },
      { periodId: 'p', areaId: 'b', actualWeeklyHours: 15, energy: 6 },
    ];
    const r = intendedVsActual(period, cf);
    expect(r.rows.find((x) => x.areaId === 'a')).toMatchObject({ gap: -5, ratio: 0.5 });
    expect(r.total.value).toBe(1);
  });
});

describe('flags', () => {
  it('ranks liabilities by burden × weight and skips fully healthy ones', () => {
    const mk = (name: string, weight: number) =>
      item({ name, section: 'liability', direction: 'lower', target: 0, worst: 10, weight });
    const [a, b, c] = [mk('A', 2), mk('B', 9), mk('C', 5)];
    const flags = biggestLiabilities([entry(a!, 10), entry(b!, 5), entry(c!, 0)]);
    expect(flags.map((f) => f.entry.snapshot.name)).toEqual(['B', 'A']); // 450 vs 200; C has no burden
  });
  it('neglected: high-weight and weak, or under-delivered hours', () => {
    const areas: Area[] = [
      { id: 'hl', name: 'Health', weight: 9, intendedWeeklyHours: 5, order: 0, archived: false },
      { id: 'rc', name: 'Recreation', weight: 3, intendedWeeklyHours: 5, order: 1, archived: false },
      { id: 'fn', name: 'Finances', weight: 8, intendedWeeklyHours: 5, order: 2, archived: false },
    ];
    const hi = item({ areaId: 'hl', target: 100 }); const rc = item({ areaId: 'rc', target: 100 });
    const fn = item({ areaId: 'fn', target: 100 });
    const scores = [areaScore('hl', [entry(hi, 20)]), areaScore('rc', [entry(rc, 10)]), areaScore('fn', [entry(fn, 90)])];
    const period: Period = {
      id: 'p', kind: 'month', start: '', end: '', label: '', status: 'closed',
      intendedHoursByArea: { hl: 10, rc: 10, fn: 10 },
    };
    const cf: CashFlowEntry[] = [
      { periodId: 'p', areaId: 'hl', actualWeeklyHours: 2, energy: 5 },
      { periodId: 'p', areaId: 'rc', actualWeeklyHours: 1, energy: 5 },
      { periodId: 'p', areaId: 'fn', actualWeeklyHours: 5, energy: 5 },
    ];
    const f = neglectedAreas(areas, scores, period, cf);
    expect(f.map((x) => x.areaId).sort()).toEqual(['fn', 'hl']); // rc is low weight; fn under hours only
    expect(f.find((x) => x.areaId === 'hl')!.reasons).toHaveLength(2);
    expect(f.find((x) => x.areaId === 'fn')!.reasons).toHaveLength(1);
  });
  it('biggest movers compares health between periods', () => {
    const a = item({ name: 'A' }); const b = item({ name: 'B' }); const c = item({ name: 'C' });
    const prev = [entry(a, 50, 'p0'), entry(b, 50, 'p0'), entry(c, 50, 'p0')];
    const cur = [entry(a, 60, 'p1'), entry(b, 20, 'p1'), entry(c, 50, 'p1')];
    const m = biggestMovers(cur, prev);
    expect(m.map((x) => [x.name, x.delta])).toEqual([['B', -30], ['A', 10]]);
  });
});

describe('snapshots', () => {
  it('editing an item later does not rewrite recorded health', () => {
    const it1 = item({ target: 100 });
    const e = entry(it1, 50);
    it1.target = 50; // user lowers the target later
    expect(entryHealth(e).value).toBe(50);
    expect(entryHealth(makeEntry(it1, 'p2', 50)).value).toBe(100);
  });
});

import { incomeScore, unitTotals } from './scoring';
import { computeIncomeTrend } from './trends';

describe('income statement', () => {
  const income = item({ name: 'Income', section: 'inflow', unit: '$', target: 6000, worst: 0, weight: 5 });
  const spend = item({ name: 'Spend', section: 'outflow', direction: 'lower', unit: '$', target: 4000, worst: 6000, weight: 5 });
  it('mirrors the balance-sheet method on inflows and outflows', () => {
    const s = incomeScore('fin', [entry(income, 6000), entry(spend, 4000)]);
    expect(s.case).toBe('both');
    expect(s.equity.value).toBe(100);
    expect(s.equity.label).toBe('Period result');
    expect(incomeScore('fin', [entry(income, 3000), entry(spend, 5000)]).equity.value).toBe(50); // I=50, D=50
    expect(incomeScore('fin', [entry(income, 3000), entry(spend, 4000)]).equity.value).toBe(75); // I=50, D=0
  });
  it('ignores assets and liabilities', () => {
    expect(incomeScore('fin', [entry(item({ section: 'asset' }), 50)]).case).toBe('no-data');
  });
  it('totals dollars and hours literally, ignoring other units', () => {
    const hrs = item({ section: 'outflow', unit: 'hours/wk' }); const hrsIn = item({ section: 'inflow', unit: 'hours' });
    const days = item({ section: 'inflow', unit: 'days/wk' });
    const t = unitTotals([entry(income, 5600), entry(spend, 4300), entry(hrs, 46), entry(hrsIn, 6), entry(days, 3)]);
    expect(t).toEqual([
      { unit: '$', inflow: 5600, outflow: 4300, net: 1300 },
      { unit: 'hours', inflow: 6, outflow: 46, net: -40 },
    ]);
  });
  it('income trend gives a value per period, null when empty', () => {
    const ps = [
      { id: 'p1', kind: 'month' as const, start: '2026-01-01', end: '', label: '', status: 'closed' as const, intendedHoursByArea: {} },
      { id: 'p2', kind: 'month' as const, start: '2026-02-01', end: '', label: '', status: 'closed' as const, intendedHoursByArea: {} },
    ];
    const a: Area = { id: 'fin', name: 'F', weight: 5, intendedWeeklyHours: 0, order: 0, archived: false };
    const t = computeIncomeTrend([a], ps, [entry(income, 6000, 'p1'), entry(spend, 4000, 'p1')]);
    expect(t.map((x) => x.value)).toEqual([100, null]);
  });
});

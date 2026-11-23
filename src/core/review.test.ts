import { describe, expect, it } from 'vitest';
import { carriedOverCount, minutesLeft, prefillCashflow, prefillEntries, previousPeriod } from './review';
import { computeTrends, shortLabel } from './trends';
import { makeEntry } from './scoring';
import type { Area, LineItem, Period } from './types';

const item = (id: string, o: Partial<LineItem> = {}): LineItem => ({
  id, areaId: 'a', name: id, section: 'asset', valueType: 'quantitative', direction: 'higher',
  target: 100, worst: 0, weight: 5, archived: false, ...o,
});
const period = (id: string, start: string): Period => ({
  id, kind: 'month', start, end: start, label: id, status: 'closed', intendedHoursByArea: {},
});
const area: Area = { id: 'a', name: 'A', weight: 5, intendedWeeklyHours: 0, order: 0, archived: false };

describe('previousPeriod', () => {
  const ps = [period('c', '2026-03-01'), period('a', '2026-01-01'), period('b', '2026-02-01')];
  it('finds the period before by start date regardless of array order', () => {
    expect(previousPeriod(ps, 'c')?.id).toBe('b');
    expect(previousPeriod(ps, 'a')).toBeNull();
  });
});

describe('prefillEntries', () => {
  const [x, y, z] = [item('x'), item('y'), item('z', { archived: true })];
  const prev = [x, y, z].map((i) => makeEntry(i, 'p0', 40));
  it('copies last values as carried-over, for active items only', () => {
    const out = prefillEntries([x, y, z], prev, [], 'p1');
    expect(out.map((e) => e.lineItemId).sort()).toEqual(['x', 'y']);
    expect(out.every((e) => e.carriedOver && e.value === 40 && e.periodId === 'p1')).toBe(true);
  });
  it('never overwrites existing entries and is idempotent', () => {
    const existing = [makeEntry(x, 'p1', 90)];
    const out = prefillEntries([x, y], prev, existing, 'p1');
    expect(out.map((e) => e.lineItemId)).toEqual(['y']);
    expect(prefillEntries([x, y], prev, [...existing, ...out], 'p1')).toEqual([]);
  });
  it('skips items with no history', () => {
    expect(prefillEntries([item('new')], prev, [], 'p1')).toEqual([]);
  });
  it('uses current item targets, not the old snapshot', () => {
    const changed = item('x', { target: 50 });
    const [e] = prefillEntries([changed], prev, [], 'p1');
    expect(e!.snapshot.target).toBe(50);
  });
});

describe('cashflow prefill and helpers', () => {
  it('copies only missing areas', () => {
    const prev = [{ periodId: 'p0', areaId: 'a', actualWeeklyHours: 5, energy: 6 }, { periodId: 'p0', areaId: 'b', actualWeeklyHours: 2, energy: 4 }];
    const out = prefillCashflow(prev, [{ periodId: 'p1', areaId: 'a', actualWeeklyHours: 9, energy: 8 }], 'p1');
    expect(out).toEqual([{ periodId: 'p1', areaId: 'b', actualWeeklyHours: 2, energy: 4, carriedOver: true }]);
  });
  it('counts carried-over values and estimates time', () => {
    const e = makeEntry(item('x'), 'p', 1);
    expect(carriedOverCount([{ ...e, carriedOver: true }, e], [{ periodId: 'p', areaId: 'a', actualWeeklyHours: 1, energy: 5, carriedOver: true }])).toBe(2);
    expect(minutesLeft(0)).toBe(1); expect(minutesLeft(45)).toBe(6);
  });
});

describe('computeTrends', () => {
  it('produces ordered per-period life and area series, null for empty periods', () => {
    const ps = [period('p2', '2026-02-01'), period('p1', '2026-01-01'), period('p3', '2026-03-01')];
    const it = item('x');
    const entries = [makeEntry(it, 'p1', 20), makeEntry(it, 'p2', 60)];
    const t = computeTrends([area], ps, entries);
    expect(t.life.map((p) => p.value)).toEqual([20, 60, null]);
    expect(t.areas['a']!.map((p) => p.label)).toEqual(['Jan ’26', 'Feb ’26', 'Mar ’26']);
    expect(t.areas['a']!.map((p) => p.value)).toEqual([20, 60, null]);
  });
  it('shortLabel formats months and passes custom labels through', () => {
    expect(shortLabel(period('x', '2026-10-01'))).toBe('Oct ’26');
    expect(shortLabel({ ...period('x', '2026-10-01'), kind: 'custom', label: 'Sabbatical' })).toBe('Sabbatical');
  });
});

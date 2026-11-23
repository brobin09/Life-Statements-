import { describe, expect, it } from 'vitest';
import { goalProgress, latestEntries } from './goals';
import { nextTarget, suggestForArea, weakAreas } from './suggestions';
import { areaSummaryRows, csvCell, lineItemRows, toCsv } from './export';
import { makeEntry } from './scoring';
import type { Area, Goal, LineItem, Period } from './types';

let n = 0;
const item = (o: Partial<LineItem> = {}): LineItem => ({
  id: `i${++n}`, areaId: 'a', name: 'Item', section: 'asset', valueType: 'quantitative', direction: 'higher',
  target: 100, worst: 0, weight: 5, archived: false, ...o,
});
const area: Area = { id: 'a', name: 'Area', weight: 5, intendedWeeklyHours: 4, order: 0, archived: false };
const period = (id: string, start: string): Period => ({ id, kind: 'month', start, end: start, label: id, status: 'closed', intendedHoursByArea: { a: 4 } });

describe('nextTarget', () => {
  const snap = (o: object) => ({ direction: 'higher' as const, target: 100, ...o });
  it('moves about a quarter of the gap and never overshoots', () => {
    expect(nextTarget(0, snap({ target: 100 }))).toBe(25);
    expect(nextTarget(99, snap({ target: 100 }))).toBe(100);
    expect(nextTarget(100, snap({ target: 100 }))).toBe(100);
  });
  it('works downward for lower-is-better and for ratings', () => {
    expect(nextTarget(8, snap({ direction: 'lower', target: 0 }))).toBe(6);
    const rubric = { question: '', anchors: { 2: '', 5: '', 8: '' } };
    expect(nextTarget(5, snap({ target: 8, rubric }))).toBe(6);
    expect(nextTarget(8, snap({ direction: 'lower', target: 3, rubric }))).toBe(7);
  });
  it('rounds large money gaps to readable steps', () => {
    expect(nextTarget(8000, snap({ target: 15000 }))).toBe(10000); // gap 7000 → 1750 → rounds to a 2000 step
  });
  it('range: no move inside tolerance, else toward the nearest edge', () => {
    expect(nextTarget(172, { direction: 'range', target: 170, tolerance: 5 })).toBe(172);
    expect(nextTarget(200, { direction: 'range', target: 170, tolerance: 5 })).toBeLessThan(200);
    expect(nextTarget(200, { direction: 'range', target: 170, tolerance: 5 })).toBeGreaterThan(175);
  });
});

describe('suggestForArea', () => {
  const big = item({ id: 'big', name: 'Big gap', weight: 9, templateId: 'fin-savings' });
  const small = item({ id: 'small', name: 'Small gap', weight: 2 });
  const full = item({ id: 'full', name: 'Fine' });
  const mid = item({ id: 'mid', name: 'Mid', weight: 5, section: 'liability', direction: 'lower', target: 0, worst: 10 });
  const entries = [makeEntry(big, 'p', 10), makeEntry(small, 'p', 10), makeEntry(full, 'p', 100), makeEntry(mid, 'p', 8)];
  const items = [big, small, full, mid];

  it('picks the largest weight × gap first, uses the library, skips healthy items', () => {
    const s = suggestForArea(area, entries, items);
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.lineItemId)).toEqual(['big', 'mid', 'small']);
    expect(s[0]!.title).toContain('automatic transfer');
    expect(s[0]).toMatchObject({ itemName: 'Big gap', baselineValue: 10 });
    expect(s[0]!.targetValue).toBe(35); // gap 90 → 22.5 → rounds to a 25 step
  });
  it('gives stable ids, honours exclusions with replacements, and pads when items run out', () => {
    const first = suggestForArea(area, entries, items);
    expect(first[0]!.id).toBe('big:step');
    const again = suggestForArea(area, entries, items, new Set(['big:step', 'mid:step']));
    expect(again.map((x) => x.id)).toEqual(['small:step', 'a:pad:0', 'a:pad:1']);
    expect(again.every((x) => x.rationale.length > 0)).toBe(true);
  });
  it('explains itself with the numbers used', () => {
    const r = suggestForArea(area, entries, items)[0]!.rationale;
    expect(r).toContain('90 × 9 = 810');
  });
});

describe('weakAreas', () => {
  it('returns areas under the threshold, weakest first, ignoring no-data and archived', () => {
    const mk = (id: string, archived = false): Area => ({ ...area, id, name: id, archived });
    const r = weakAreas([mk('a'), mk('b'), mk('c'), mk('d', true), mk('e')], { a: 40, b: 20, c: 70, d: 10, e: null }, 50);
    expect(r.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('goals', () => {
  const g = (o: Partial<Goal>): Goal => ({ id: 'g', areaId: 'a', title: 't', status: 'active', createdAt: '', ...o });
  it('measures progress along baseline → target in either direction', () => {
    expect(goalProgress(g({ baselineValue: 0, targetValue: 10 }), 5)).toEqual({ progress: 0.5, met: false });
    expect(goalProgress(g({ baselineValue: 10, targetValue: 4 }), 4)).toEqual({ progress: 1, met: true });
    expect(goalProgress(g({ baselineValue: 10, targetValue: 4 }), 12).progress).toBe(0);
    expect(goalProgress(g({ baselineValue: 5, targetValue: 5 }), 5).met).toBe(true);
    expect(goalProgress(g({}), 5).progress).toBeNull();
  });
  it('latestEntries takes the newest entry at or before the chosen period', () => {
    const it = item({ id: 'x' }); const ps = [period('p1', '2026-01-01'), period('p2', '2026-02-01'), period('p3', '2026-03-01')];
    const es = [makeEntry(it, 'p1', 1), makeEntry(it, 'p3', 3)];
    expect(latestEntries(es, ps, 'p2').get('x')!.value).toBe(1);
    expect(latestEntries(es, ps, 'p3').get('x')!.value).toBe(3);
  });
});

describe('csv export', () => {
  it('quotes, escapes and neutralises spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2\r\n');
  });
  it('line item rows are ordered by period and carry health and notes', () => {
    const it = item({ id: 'x', name: 'Savings, main', target: 100 });
    const ps = [period('p2', '2026-02-01'), period('p1', '2026-01-01')];
    const e1 = makeEntry(it, 'p1', 50, 'ok'); const e2 = makeEntry(it, 'p2', 75);
    const rows = lineItemRows(ps, [e2, e1], [area]);
    expect(rows[0]![0]).toBe('Period');
    expect(rows.slice(1).map((r) => [r[0], r[14]])).toEqual([['p1', 50], ['p2', 75]]);
    expect(rows[1]![15]).toBe('ok'); expect(rows[1]![4]).toBe('Balance sheet');
  });
  it('area summary has one row per area plus a weighted total', () => {
    const it = item({ id: 'x', target: 100 });
    const rows = areaSummaryRows(period('p1', '2026-01-01'), [area], [makeEntry(it, 'p1', 80)], [{ periodId: 'p1', areaId: 'a', actualWeeklyHours: 3, energy: 7 }]);
    expect(rows).toHaveLength(3);
    expect(rows[1]!.slice(1, 3)).toEqual(['Area', 5]);
    expect(rows[1]![5]).toBe(80); expect(rows[1]![10]).toBe(3); expect(rows[1]![11]).toBe(7);
    expect(rows[2]![1]).toBe('ALL AREAS (weighted)'); expect(rows[2]![5]).toBe(80);
  });
});

import { formatValue } from './format';
describe('formatValue', () => {
  it('formats money, ratings and units', () => {
    expect(formatValue(8000, '$')).toBe('$8,000');
    expect(formatValue(-1500, '$')).toBe('-$1,500');
    expect(formatValue(6, '/10')).toBe('6/10');
    expect(formatValue(46, 'hours/wk')).toBe('46 hours/wk');
    expect(formatValue(3)).toBe('3');
  });
});

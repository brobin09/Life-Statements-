import { entryHealth, incomeScore, areaScore, lifeEquity } from './scoring';
import type { Area, CashFlowEntry, Entry, Period } from './types';

export type Cell = string | number | null | undefined;

/** RFC 4180 quoting, plus a guard so spreadsheets never run user text as a formula. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s)))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: Cell[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const statement = (s: string) => (s === 'asset' || s === 'liability' ? 'Balance sheet' : 'Income statement');

export function lineItemRows(periods: Period[], entries: Entry[], areas: Area[]): Cell[][] {
  const area = new Map(areas.map((a) => [a.id, a.name]));
  const order = new Map([...periods].sort((a, b) => a.start.localeCompare(b.start)).map((p, i) => [p.id, i]));
  const header = ['Period', 'Period start', 'Period end', 'Area', 'Statement', 'Section', 'Line item', 'Value type',
    'Value', 'Unit', 'Target', 'Scores 0 at', 'Direction', 'Weight', 'Health (0-100)', 'Note', 'Recorded', 'Carried over'];
  const rows = [...entries]
    .filter((e) => order.has(e.periodId))
    .sort((a, b) => order.get(a.periodId)! - order.get(b.periodId)! || (area.get(a.snapshot.areaId) ?? '').localeCompare(area.get(b.snapshot.areaId) ?? '') || a.snapshot.name.localeCompare(b.snapshot.name))
    .map((e): Cell[] => {
      const p = periods.find((x) => x.id === e.periodId)!;
      const s = e.snapshot;
      return [p.label, p.start, p.end, area.get(s.areaId) ?? s.areaId, statement(s.section), s.section, s.name,
        s.rubric ? 'rating 1-10' : 'number', e.value, s.rubric ? '' : s.unit ?? '', s.target, s.worst, s.direction,
        s.weight, entryHealth(e).value, e.note, e.recordedAt, e.carriedOver ? 'yes' : 'no'];
    });
  return [header, ...rows];
}

export function areaSummaryRows(period: Period, areas: Area[], entries: Entry[], cashflow: CashFlowEntry[]): Cell[][] {
  const mine = entries.filter((e) => e.periodId === period.id);
  const cf = cashflow.filter((c) => c.periodId === period.id);
  const active = areas.filter((a) => !a.archived);
  const bs = active.map((a) => areaScore(a.id, mine)); const is = active.map((a) => incomeScore(a.id, mine));
  const header = ['Period', 'Area', 'Area weight', 'Asset strength', 'Liability burden', 'Area equity',
    'Inflow strength', 'Outflow drag', 'Period result', 'Intended hours/wk', 'Actual hours/wk', 'Energy (1-10)'];
  const rows = active.map((a, i): Cell[] => {
    const c = cf.find((x) => x.areaId === a.id);
    return [period.label, a.name, a.weight, bs[i]!.assetStrength.value, bs[i]!.liabilityBurden.value, bs[i]!.equity.value,
      is[i]!.assetStrength.value, is[i]!.liabilityBurden.value, is[i]!.equity.value,
      period.intendedHoursByArea[a.id] ?? a.intendedWeeklyHours, c?.actualWeeklyHours ?? null, c?.energy ?? null];
  });
  const life = lifeEquity(active, bs).breakdown.value; const net = lifeEquity(active, is, 'Period result').breakdown.value;
  rows.push([period.label, 'ALL AREAS (weighted)', null, null, null, life, null, null, net, null, null, null]);
  return [header, ...rows];
}
